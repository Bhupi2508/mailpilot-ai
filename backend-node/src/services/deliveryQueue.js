/**
 * Delivery queue: sends one message per delivery row with bounded concurrency.
 *
 * The queue lives in the database (deliveries.status = 'queued'), so no Redis
 * is needed and queued work survives a restart. A delivery is claimed with a
 * conditional UPDATE, so it is never sent twice even with several workers.
 *
 * Outcomes per delivery:
 *   accepted - the provider accepted the message (NOT proof of inbox delivery)
 *   failed   - rejected, or temporary failures exhausted SEND_MAX_ATTEMPTS
 *   skipped  - not attempted because a provider-wide error (e.g. bad
 *              credentials) stopped the batch
 *   unknown  - the connection broke mid-send; may or may not have been sent.
 *              Never retried automatically.
 */
const { logger, maskEmail } = require("../utils/logger");
const { buildMessage } = require("./messageBuilder");
const { attachmentsForSending } = require("./attachments");
const { ProviderError } = require("./providers/errors");

function createDeliveryQueue({ db, config, provider, batchService }) {
  const { concurrency, delayMs, maxAttempts, retryBaseMs, pollMs } = config.sending;
  let active = 0;
  let nextStartAt = 0;
  let timer = null;
  let interval = null;
  let started = false;
  let stopping = false;
  let ticking = false;
  const batchCache = new Map();

  async function loadBatch(batchId) {
    if (batchCache.has(batchId)) return batchCache.get(batchId);
    const b = await db.get("SELECT * FROM batches WHERE id = ?", [batchId]);
    const ctx = {
      id: b.id,
      content: { subject: b.subject, body: b.body, bodyType: b.body_type, cc: JSON.parse(b.cc), bcc: JSON.parse(b.bcc) },
      attachmentMeta: JSON.parse(b.attachments),
      accountId: b.account_id,
      sender: b.sender,
      senderName: b.sender_name,
    };
    batchCache.set(batchId, ctx);
    return ctx;
  }

  async function claim() {
    const now = new Date().toISOString();
    const candidates = await db.all(
      "SELECT id FROM deliveries WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY next_attempt_at, position LIMIT 5",
      [now]
    );
    for (const { id } of candidates) {
      const res = await db.run(
        "UPDATE deliveries SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued'",
        [now, id]
      );
      if (res.changes === 1) return db.get("SELECT * FROM deliveries WHERE id = ?", [id]);
    }
    return null;
  }

  async function settle(d, fields) {
    const now = new Date().toISOString();
    await db.run(
      `UPDATE deliveries SET status = ?, error_code = ?, error_message = ?, provider_message_id = ?, accepted_at = ?,
         next_attempt_at = ?, updated_at = ? WHERE id = ?`,
      [
        fields.status,
        fields.errorCode || null,
        fields.error ? String(fields.error).slice(0, 500) : null,
        fields.messageId || null,
        fields.status === "accepted" ? now : null,
        fields.nextAttemptAt || now,
        now,
        d.id,
      ]
    );
  }

  async function process(d) {
    const who = maskEmail(d.recipient_email);
    const attempt = Number(d.attempts);
    try {
      const batch = await loadBatch(d.batch_id);
      const attachments = attachmentsForSending(config.attachmentsDir, batch.id, batch.attachmentMeta);
      const message = {
        ...buildMessage(batch.content, { email: d.recipient_email, name: d.recipient_name }, attachments),
        from: { name: batch.senderName, address: batch.sender },
      };
      const result = await provider.send(message, { attempt, accountId: batch.accountId, sender: batch.sender });
      await settle(d, { status: "accepted", messageId: result.messageId });
      logger.info("delivery accepted", { batch: d.batch_id, to: who, attempt, provider: provider.name });
    } catch (err) {
      const pe =
        err instanceof ProviderError
          ? err
          : new ProviderError("permanent", /attachment/i.test(err.message) ? err.message : "Internal error while preparing this message.", {
              code: "internal_error",
            });
      if (!(err instanceof ProviderError)) logger.error("delivery crashed", { batch: d.batch_id, error: err.message });

      if (pe.kind === "transient" && attempt < maxAttempts) {
        const backoff = Math.max(pe.retryAfterMs || 0, retryBaseMs * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
        await settle(d, {
          status: "queued",
          errorCode: pe.code,
          error: `Attempt ${attempt} failed: ${pe.message}`,
          nextAttemptAt: new Date(Date.now() + backoff).toISOString(),
        });
        logger.warn("delivery deferred", { batch: d.batch_id, to: who, attempt, code: pe.code, retryInMs: backoff });
        setTimeout(kick, backoff + 10).unref?.();
        return;
      }
      if (pe.kind === "unknown") {
        await settle(d, { status: "unknown", errorCode: pe.code, error: pe.message });
      } else {
        const exhausted = pe.kind === "transient" ? ` (gave up after ${attempt} attempts)` : "";
        await settle(d, { status: "failed", errorCode: pe.code, error: pe.message + exhausted });
      }
      logger.warn("delivery not accepted", { batch: d.batch_id, to: who, attempt, kind: pe.kind, code: pe.code });

      if (pe.kind === "fatal") {
        const now = new Date().toISOString();
        await db.run(
          `UPDATE deliveries SET status = 'skipped', error_code = ?, error_message = ?, updated_at = ?
           WHERE batch_id = ? AND status = 'queued'`,
          [pe.code, `Not attempted: ${pe.message}`, now, d.batch_id]
        );
      }
    } finally {
      try {
        await batchService.finalize(d.batch_id);
        const pending = await db.get("SELECT COUNT(*) AS n FROM deliveries WHERE batch_id = ? AND status IN ('queued', 'sending')", [
          d.batch_id,
        ]);
        if (!Number(pending.n)) batchCache.delete(d.batch_id);
      } catch (err) {
        logger.error("batch finalize failed", { batch: d.batch_id, error: err.message });
      }
    }
  }

  async function tick() {
    if (!started || stopping || ticking) return;
    ticking = true;
    try {
      while (!stopping && active < concurrency) {
        const wait = nextStartAt - Date.now();
        if (wait > 0) {
          clearTimeout(timer);
          timer = setTimeout(kick, wait);
          break;
        }
        const d = await claim();
        if (!d) break;
        active += 1;
        nextStartAt = Date.now() + delayMs;
        process(d).finally(() => {
          active -= 1;
          kick();
        });
      }
    } catch (err) {
      logger.error("queue tick failed", { error: err.message });
    } finally {
      ticking = false;
    }
  }

  function kick() {
    setImmediate(tick);
  }

  return {
    kick,
    /** Marks deliveries interrupted by a previous crash/restart, then starts polling. */
    async start() {
      const now = new Date().toISOString();
      const interrupted = await db.all("SELECT DISTINCT batch_id FROM deliveries WHERE status = 'sending'");
      await db.run(
        `UPDATE deliveries SET status = 'unknown', error_code = 'interrupted',
           error_message = 'The server stopped while this message was being sent. It may or may not have been delivered.',
           updated_at = ? WHERE status = 'sending'`,
        [now]
      );
      for (const { batch_id } of interrupted) await batchService.finalize(batch_id);
      if (interrupted.length) logger.warn(`marked in-flight deliveries of ${interrupted.length} batch(es) as unknown after restart`);
      started = true;
      interval = setInterval(kick, pollMs);
      interval.unref?.();
      kick();
    },
    async stop() {
      stopping = true;
      clearInterval(interval);
      clearTimeout(timer);
      const deadline = Date.now() + 30000;
      while (active > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    },
    get active() {
      return active;
    },
  };
}

module.exports = { createDeliveryQueue };
