/**
 * Batches: one compose action = one batch = N deliveries (one per To recipient).
 *
 * Creating a batch only validates and records work; the delivery queue does the
 * sending. Batches are idempotent per (user, Idempotency-Key): repeating a
 * request with the same key returns the original batch instead of sending again.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ApiError = require("../utils/ApiError");
const { uuid } = require("../utils/crypto");
const { normalizeRecipients, parseAddress } = require("./recipients");
const { anyPolicy, listPolicy, isSenderAllowed, describePolicy } = require("./providers/senderPolicy");
const { buildMessage, tokenWarnings, htmlToText } = require("./messageBuilder");
const attachmentsStore = require("./attachments");

const IN_PROGRESS = ["queued", "sending"];
const STATUSES = ["queued", "sending", "accepted", "failed", "skipped", "unknown"];
const IDEMPOTENCY_RE = /^[A-Za-z0-9_.:-]{8,100}$/;

const json = (v, fallback) => {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};
const isUniqueViolation = (err) => err && (err.code === "23505" || String(err.code).startsWith("SQLITE_CONSTRAINT"));

function createBatchService({ db, config, provider, googleOAuth }) {
  const limits = config.limits;
  let queue = null; // set by attachQueue() to avoid a circular dependency

  /** Validates To/CC/BCC + subject/body. Throws 422 with all problems. */
  function validateInput(input) {
    const recipients = normalizeRecipients({ to: input.to, cc: input.cc, bcc: input.bcc }, limits);
    const errors = [...recipients.errors];
    const subject = typeof input.subject === "string" ? input.subject.trim() : "";
    const bodyType = input.body_type === undefined || input.body_type === "" ? "html" : input.body_type;
    const body = typeof input.body === "string" ? input.body : "";

    if (!subject) errors.push({ field: "subject", message: "Add a subject." });
    else if (subject.length > limits.maxSubjectLength) {
      errors.push({ field: "subject", message: `Subject must be at most ${limits.maxSubjectLength} characters.` });
    } else if (/[\r\n]/.test(subject)) errors.push({ field: "subject", message: "Subject cannot contain line breaks." });

    if (!["html", "text"].includes(bodyType)) errors.push({ field: "body_type", message: "body_type must be 'html' or 'text'." });
    const visible = bodyType === "html" ? htmlToText(body) || (/<img\s/i.test(body) ? "img" : "") : body.trim();
    if (!visible) errors.push({ field: "body", message: "Write a message." });
    else if (Buffer.byteLength(body) > limits.maxBodyKb * 1024) {
      errors.push({ field: "body", message: `Message is larger than ${limits.maxBodyKb} KB.` });
    }

    if (errors.length) throw new ApiError(422, errors[0].message, { code: "validation_failed", details: errors });
    const warnings = [...recipients.warnings, ...tokenWarnings([subject, body], recipients.to)];
    return { to: recipients.to, cc: recipients.cc, bcc: recipients.bcc, subject, body, bodyType, warnings };
  }

  /** Which From addresses the provider accepts for this user. */
  async function senderPolicyFor(user, { requireAccount = true } = {}) {
    if (provider.name === "gmail") {
      // The Gmail API only sends as the connected Google account.
      const account = await googleOAuth.findAccount(user.id);
      if (!account && requireAccount) throw new ApiError(409, "Connect your Google account before sending.", { code: "account_required" });
      return { policy: listPolicy(account ? [account.provider_email] : []), accountId: account?.id || null };
    }
    return { policy: provider.senderPolicy ? provider.senderPolicy() : anyPolicy(), accountId: null };
  }

  /**
   * Picks the From address: the one requested, else the user's verified email.
   * It must be a valid address AND authorized by the provider; we never send
   * as an address the mail server hasn't approved.
   */
  async function resolveSender(user, requestedFrom) {
    const { policy, accountId } = await senderPolicyFor(user);
    const raw = typeof requestedFrom === "string" && requestedFrom.trim() ? requestedFrom.trim() : user.email;
    const parsed = parseAddress(raw);
    const fail = (message, code) => new ApiError(422, message, { code, details: [{ field: "from", message, value: raw }] });
    if (parsed.error) throw fail("Enter a valid From email address.", "validation_failed");
    if (!isSenderAllowed(policy, parsed.email)) {
      throw fail(
        `${parsed.email} isn't an authorized sender for this mail server, so the email would be rejected. Authorized: ${describePolicy(policy)}.`,
        "sender_not_authorized"
      );
    }
    const name = parsed.name || (parsed.email === user.email ? user.name : provider.name === "smtp" ? config.smtp.fromName : "");
    return { address: parsed.email, name: name || "", accountId };
  }

  async function checkQuota(user, adding) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const row = await db.get("SELECT COUNT(*) AS n FROM deliveries WHERE user_id = ? AND created_at >= ?", [user.id, since]);
    const used = Number(row.n);
    if (used + adding > limits.maxRecipientsPerDay) {
      throw new ApiError(
        429,
        `Daily limit reached: ${used} of ${limits.maxRecipientsPerDay} recipients used in the last 24 hours, and this email has ${adding}.`,
        { code: "quota_exceeded" }
      );
    }
  }

  function requestHash(v, attachments, from) {
    const canonical = JSON.stringify({
      from,
      to: v.to,
      cc: v.cc,
      bcc: v.bcc,
      subject: v.subject,
      body: v.body,
      bodyType: v.bodyType,
      attachments: attachments.map((a) => [a.filename, a.sha256]),
    });
    return crypto.createHash("sha256").update(canonical).digest("hex");
  }

  function summarize(b, counts) {
    const c = Object.fromEntries(STATUSES.map((s) => [s, Number(counts?.[s] || 0)]));
    const attachments = json(b.attachments, []).map(({ filename, size, contentType }) => ({ filename, size, contentType }));
    return {
      id: b.id,
      subject: b.subject,
      bodyType: b.body_type,
      provider: b.provider,
      simulated: Boolean(Number(b.simulated)),
      sender: b.sender,
      senderName: b.sender_name || "",
      status: b.status,
      total: Number(b.total),
      counts: c,
      cc: json(b.cc, []),
      bcc: json(b.bcc, []),
      attachments,
      attachmentsAvailable: Boolean(Number(b.attachments_available)),
      canRetry:
        c.failed + c.skipped > 0 &&
        c.queued + c.sending === 0 &&
        (attachments.length === 0 || Boolean(Number(b.attachments_available))),
      createdAt: b.created_at,
      completedAt: b.completed_at,
    };
  }

  async function countsFor(batchId) {
    const rows = await db.all("SELECT status, COUNT(*) AS n FROM deliveries WHERE batch_id = ? GROUP BY status", [batchId]);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  }

  async function getOwned(user, id) {
    const b = await db.get("SELECT * FROM batches WHERE id = ? AND user_id = ?", [String(id), user.id]);
    if (!b) throw new ApiError(404, "Batch not found.");
    return b;
  }

  return {
    attachQueue(q) {
      queue = q;
    },
    validateInput,

    /** Renders the exact message one recipient would receive. Nothing is stored or sent. */
    async preview(user, input) {
      const v = validateInput(input);
      const from = await resolveSender(user, input.from);
      const index = Math.min(Math.max(Number.parseInt(input.index, 10) || 0, 0), v.to.length - 1);
      const attachments = Array.isArray(input.attachments)
        ? input.attachments.slice(0, 20).map((a) => ({ filename: String(a?.filename || a?.name || "file").slice(0, 150) }))
        : [];
      const message = buildMessage(v, v.to[index], attachments);
      return {
        index,
        total: v.to.length,
        recipients: v.to,
        cc: v.cc,
        bcc: v.bcc,
        warnings: v.warnings,
        simulated: provider.simulated,
        message: {
          from: from.name ? `${from.name} <${from.address}>` : from.address,
          to: message.to,
          cc: message.cc,
          bcc: message.bcc,
          subject: message.subject,
          html: message.html || null,
          text: message.text,
          attachments: attachments.map((a) => a.filename),
        },
      };
    },

    /** Validates, stores and enqueues a batch. Returns { batch, replayed }. */
    async create(user, input, files, idempotencyKey) {
      if (!idempotencyKey || !IDEMPOTENCY_RE.test(idempotencyKey)) {
        throw new ApiError(400, "An Idempotency-Key header (8-100 letters, digits, - _ . :) is required.", {
          code: "idempotency_key_required",
        });
      }
      const v = validateInput(input);
      const uploads = attachmentsStore.validateUploads(files, config.uploads);
      const from = await resolveSender(user, input.from);
      const hash = requestHash(v, uploads, from.address);

      const replay = async () => {
        const existing = await db.get("SELECT * FROM batches WHERE user_id = ? AND idempotency_key = ?", [user.id, idempotencyKey]);
        if (!existing) return null;
        if (existing.request_hash !== hash) {
          throw new ApiError(409, "This Idempotency-Key was already used for a different email.", { code: "idempotency_conflict" });
        }
        return { batch: summarize(existing, await countsFor(existing.id)), replayed: true };
      };
      const prior = await replay();
      if (prior) return prior;

      await checkQuota(user, v.to.length);
      const id = uuid();
      const now = new Date().toISOString();
      const stored = attachmentsStore.storeAttachments(config.attachmentsDir, id, uploads);

      try {
        await db.transaction(async (tx) => {
          await tx.run(
            `INSERT INTO batches (id, user_id, provider, simulated, sender, sender_name, account_id, subject, body, body_type, cc, bcc,
               attachments, attachments_available, idempotency_key, request_hash, status, total, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sending', ?, ?, ?)`,
            [
              id,
              user.id,
              provider.name,
              provider.simulated ? 1 : 0,
              from.address,
              from.name,
              from.accountId,
              v.subject,
              v.body,
              v.bodyType,
              JSON.stringify(v.cc),
              JSON.stringify(v.bcc),
              JSON.stringify(stored),
              stored.length ? 1 : 0,
              idempotencyKey,
              hash,
              v.to.length,
              now,
              now,
            ]
          );
          for (const [position, r] of v.to.entries()) {
            await tx.run(
              `INSERT INTO deliveries (id, batch_id, user_id, position, recipient_email, recipient_name, status,
                 next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
              [uuid(), id, user.id, position, r.email, r.name, now, now, now]
            );
          }
        });
      } catch (err) {
        attachmentsStore.removeAttachments(config.attachmentsDir, id);
        if (isUniqueViolation(err)) {
          const raced = await replay();
          if (raced) return raced;
        }
        throw err;
      }

      queue?.kick();
      const batch = await db.get("SELECT * FROM batches WHERE id = ?", [id]);
      return { batch: summarize(batch, { queued: v.to.length }), replayed: false, warnings: v.warnings };
    },

    /** The From addresses this user may pick (drives the compose screen's warning). */
    async senders(user) {
      const { policy } = await senderPolicyFor(user, { requireAccount: false });
      return {
        default: user.email,
        mode: policy.mode,
        addresses: policy.addresses,
        domains: policy.domains,
        defaultAuthorized: isSenderAllowed(policy, user.email),
      };
    },

    async get(user, id) {
      const b = await getOwned(user, id);
      const deliveries = await db.all(
        `SELECT id, recipient_email, recipient_name, status, attempts, error_code, error_message, accepted_at, updated_at
         FROM deliveries WHERE batch_id = ? ORDER BY position`,
        [b.id]
      );
      return {
        ...summarize(b, await countsFor(b.id)),
        body: b.body,
        deliveries: deliveries.map((d) => ({
          id: d.id,
          email: d.recipient_email,
          name: d.recipient_name,
          status: d.status,
          attempts: Number(d.attempts),
          errorCode: d.error_code,
          error: d.error_message,
          acceptedAt: d.accepted_at,
          updatedAt: d.updated_at,
        })),
      };
    },

    async list(user, { page = 1, limit = 20, search = "", status = "" } = {}) {
      const where = ["b.user_id = ?"];
      const params = [user.id];
      if (search) {
        where.push("LOWER(b.subject) LIKE ? ESCAPE '\\'");
        params.push(`%${search.toLowerCase().replace(/[\\%_]/g, (c) => "\\" + c)}%`);
      }
      if (status) {
        where.push("b.status = ?");
        params.push(status);
      }
      const total = Number((await db.get(`SELECT COUNT(*) AS n FROM batches b WHERE ${where.join(" AND ")}`, params)).n);
      const rows = await db.all(
        `SELECT b.*, s.status AS d_status, s.n AS d_count
         FROM (SELECT * FROM batches b WHERE ${where.join(" AND ")} ORDER BY b.created_at DESC LIMIT ? OFFSET ?) b
         LEFT JOIN (SELECT batch_id, status, COUNT(*) AS n FROM deliveries GROUP BY batch_id, status) s ON s.batch_id = b.id
         ORDER BY b.created_at DESC`,
        [...params, limit, (page - 1) * limit]
      );
      const byId = new Map();
      for (const r of rows) {
        if (!byId.has(r.id)) byId.set(r.id, { row: r, counts: {} });
        if (r.d_status) byId.get(r.id).counts[r.d_status] = Number(r.d_count);
      }
      return {
        batches: [...byId.values()].map(({ row, counts }) => summarize(row, counts)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    },

    async stats(user) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [batches, byStatus, recent] = await Promise.all([
        db.get("SELECT COUNT(*) AS n FROM batches WHERE user_id = ?", [user.id]),
        db.all("SELECT status, COUNT(*) AS n FROM deliveries WHERE user_id = ? GROUP BY status", [user.id]),
        db.get("SELECT COUNT(*) AS n FROM deliveries WHERE user_id = ? AND created_at >= ?", [user.id, since]),
      ]);
      const c = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)]));
      return {
        batches: Number(batches.n),
        emails: Object.values(c).reduce((a, b) => a + b, 0),
        accepted: c.accepted || 0,
        failed: (c.failed || 0) + (c.skipped || 0),
        unknown: c.unknown || 0,
        inProgress: (c.queued || 0) + (c.sending || 0),
        last24h: Number(recent.n),
        dailyLimit: limits.maxRecipientsPerDay,
      };
    },

    /** Re-queues failed/skipped deliveries. "unknown" ones are never retried (could duplicate). */
    async retry(user, id) {
      const b = await getOwned(user, id);
      const summary = summarize(b, await countsFor(b.id));
      if (summary.counts.queued + summary.counts.sending > 0) {
        throw new ApiError(409, "This batch is still sending.", { code: "batch_in_progress" });
      }
      if (summary.attachments.length && !summary.attachmentsAvailable) {
        throw new ApiError(409, "The attachments for this email were deleted after the retention period. Compose a new email instead.", {
          code: "attachments_expired",
        });
      }
      const now = new Date().toISOString();
      const res = await db.run(
        `UPDATE deliveries SET status = 'queued', attempts = 0, next_attempt_at = ?, error_code = NULL, error_message = NULL, updated_at = ?
         WHERE batch_id = ? AND status IN ('failed', 'skipped')`,
        [now, now, b.id]
      );
      if (!res.changes) throw new ApiError(409, "There are no failed deliveries to retry.", { code: "nothing_to_retry" });
      await db.run("UPDATE batches SET status = 'sending', completed_at = NULL, attachments_expire_at = NULL, updated_at = ? WHERE id = ?", [
        now,
        b.id,
      ]);
      queue?.kick();
      return { requeued: res.changes };
    },

    /** Called by the queue after each delivery settles. Completes the batch once nothing is pending. */
    async finalize(batchId) {
      const counts = await countsFor(batchId);
      if (IN_PROGRESS.some((s) => counts[s])) return;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const accepted = counts.accepted || 0;
      const status = accepted === total ? "completed" : accepted === 0 ? "failed" : "partial";
      const now = new Date().toISOString();
      const retryable = (counts.failed || 0) + (counts.skipped || 0) > 0;
      // Keep attachments for a while if a retry may need them; otherwise delete now.
      const keep = retryable && config.uploads.retentionHours > 0;
      const res = keep
        ? await db.run(
            `UPDATE batches SET status = ?, completed_at = ?, updated_at = ?, attachments_expire_at = ?
             WHERE id = ? AND completed_at IS NULL`,
            [status, now, now, new Date(Date.now() + config.uploads.retentionHours * 3600e3).toISOString(), batchId]
          )
        : await db.run(
            `UPDATE batches SET status = ?, completed_at = ?, updated_at = ?, attachments_available = 0, attachments_expire_at = NULL
             WHERE id = ? AND completed_at IS NULL`,
            [status, now, now, batchId]
          );
      if (res.changes && !keep) attachmentsStore.removeAttachments(config.attachmentsDir, batchId);
    },

    /** Deletes attachment files past their retention window, and orphaned directories. */
    async sweepAttachments() {
      const now = new Date().toISOString();
      const expired = await db.all(
        "SELECT id FROM batches WHERE attachments_available = 1 AND attachments_expire_at IS NOT NULL AND attachments_expire_at < ?",
        [now]
      );
      for (const { id } of expired) {
        attachmentsStore.removeAttachments(config.attachmentsDir, id);
        await db.run("UPDATE batches SET attachments_available = 0, updated_at = ? WHERE id = ?", [now, id]);
      }
      if (!fs.existsSync(config.attachmentsDir)) return;
      const live = new Set((await db.all("SELECT id FROM batches WHERE attachments_available = 1")).map((r) => r.id));
      const cutoff = Date.now() - 10 * 60 * 1000; // never touch directories a request may still be writing
      for (const dir of fs.readdirSync(config.attachmentsDir)) {
        if (live.has(dir)) continue;
        const { mtimeMs } = fs.statSync(path.join(config.attachmentsDir, dir));
        if (mtimeMs < cutoff) attachmentsStore.removeAttachments(config.attachmentsDir, dir);
      }
    },
  };
}

module.exports = { createBatchService, STATUSES };
