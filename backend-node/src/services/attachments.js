/**
 * Attachment validation and temporary storage.
 *
 * - Only an allowlist of document/image types is accepted. The browser's MIME
 *   type is ignored; the file's leading bytes must match its extension.
 * - Files live in DATA_DIR/attachments/<batchId>/ only while the batch is
 *   sending (and, if some deliveries failed, for a retention window so they
 *   can be retried). They are then deleted.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ApiError = require("../utils/ApiError");

const startsWith = (sig) => (buf) => buf.length >= sig.length && sig.every((b, i) => buf[i] === b);
const ascii = (s) => [...Buffer.from(s, "latin1")];
const ZIP = startsWith([0x50, 0x4b, 0x03, 0x04]);
const OLE = startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const isText = (buf) => !buf.subarray(0, 8192).includes(0);

const TYPES = {
  ".pdf": { type: "application/pdf", check: startsWith(ascii("%PDF-")) },
  ".png": { type: "image/png", check: startsWith([0x89, 0x50, 0x4e, 0x47]) },
  ".jpg": { type: "image/jpeg", check: startsWith([0xff, 0xd8, 0xff]) },
  ".jpeg": { type: "image/jpeg", check: startsWith([0xff, 0xd8, 0xff]) },
  ".gif": { type: "image/gif", check: startsWith(ascii("GIF8")) },
  ".webp": {
    type: "image/webp",
    check: (b) => startsWith(ascii("RIFF"))(b) && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  ".docx": { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", check: ZIP },
  ".xlsx": { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", check: ZIP },
  ".pptx": { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", check: ZIP },
  ".doc": { type: "application/msword", check: OLE },
  ".xls": { type: "application/vnd.ms-excel", check: OLE },
  ".ppt": { type: "application/vnd.ms-powerpoint", check: OLE },
  ".csv": { type: "text/csv", check: isText },
  ".txt": { type: "text/plain", check: isText },
};
const ALLOWED_EXTENSIONS = Object.keys(TYPES);

function safeFilename(original) {
  const base = path.basename(String(original || "file").replace(/\\/g, "/"));
  // eslint-disable-next-line no-control-regex
  let clean = base.replace(/[\u0000-\u001f\u007f"<>:|?*/\\]/g, "_").replace(/^\.+/, "").trim();
  if (!clean) clean = "file";
  if (clean.length > 150) {
    const ext = path.extname(clean);
    clean = clean.slice(0, 150 - ext.length) + ext;
  }
  return clean;
}

/**
 * @param {Array} files multer memory files ({ originalname, buffer, size })
 * @returns {Array} [{ filename, contentType, size, sha256, buffer }]
 */
function validateUploads(files, limits) {
  const list = files || [];
  const errors = [];
  if (list.length > limits.maxFiles) {
    errors.push({ field: "attachments", message: `Attach at most ${limits.maxFiles} files.` });
  }
  let total = 0;
  const names = new Set();
  const out = [];
  for (const f of list) {
    const filename = safeFilename(f.originalname);
    const ext = path.extname(filename).toLowerCase();
    const spec = TYPES[ext];
    total += f.size;
    if (!spec) {
      errors.push({ field: "attachments", value: filename, message: `"${filename}" has a file type that is not allowed.` });
      continue;
    }
    if (f.size === 0) {
      errors.push({ field: "attachments", value: filename, message: `"${filename}" is empty.` });
      continue;
    }
    if (f.size > limits.maxFileMb * 1024 * 1024) {
      errors.push({ field: "attachments", value: filename, message: `"${filename}" is larger than ${limits.maxFileMb} MB.` });
      continue;
    }
    if (!spec.check(f.buffer)) {
      errors.push({
        field: "attachments",
        value: filename,
        message: `"${filename}" does not look like a real ${ext.slice(1).toUpperCase()} file.`,
      });
      continue;
    }
    if (names.has(filename.toLowerCase())) {
      errors.push({ field: "attachments", value: filename, message: `"${filename}" is attached twice.` });
      continue;
    }
    names.add(filename.toLowerCase());
    out.push({
      filename,
      contentType: spec.type,
      size: f.size,
      sha256: crypto.createHash("sha256").update(f.buffer).digest("hex"),
      buffer: f.buffer,
    });
  }
  if (total > limits.maxTotalMb * 1024 * 1024) {
    errors.push({ field: "attachments", message: `Attachments total more than ${limits.maxTotalMb} MB.` });
  }
  if (errors.length) throw new ApiError(422, errors[0].message, { code: "invalid_attachments", details: errors });
  return out;
}

const batchDir = (root, batchId) => path.join(root, batchId);

/** Writes validated files to disk; returns metadata stored on the batch. */
function storeAttachments(root, batchId, validated) {
  if (!validated.length) return [];
  const dir = batchDir(root, batchId);
  fs.mkdirSync(dir, { recursive: true });
  return validated.map((a, i) => {
    const stored = `${i}${path.extname(a.filename).toLowerCase()}`;
    fs.writeFileSync(path.join(dir, stored), a.buffer, { mode: 0o600 });
    return { filename: a.filename, contentType: a.contentType, size: a.size, sha256: a.sha256, stored };
  });
}

/** Resolves stored metadata to nodemailer-style attachments (read from disk). */
function attachmentsForSending(root, batchId, meta) {
  return meta.map((a) => {
    const p = path.join(batchDir(root, batchId), a.stored);
    if (!fs.existsSync(p)) throw new Error(`Attachment "${a.filename}" is no longer available.`);
    return { filename: a.filename, contentType: a.contentType, path: p };
  });
}

function removeAttachments(root, batchId) {
  fs.rmSync(batchDir(root, batchId), { recursive: true, force: true });
}

module.exports = {
  validateUploads,
  storeAttachments,
  attachmentsForSending,
  removeAttachments,
  safeFilename,
  ALLOWED_EXTENSIONS,
};
