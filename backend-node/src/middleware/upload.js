/**
 * Multer upload middleware for email attachments.
 *
 * Only activates when the request is multipart/form-data. JSON requests
 * (no attachments) pass through untouched. Validates MIME type, extension,
 * file count, and per-file size.
 */
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const config = require("../config");
const ApiError = require("../utils/ApiError");

const MAX_SIZE_BYTES = config.uploads.maxSizeMb * 1024 * 1024;
const MAX_FILES = config.uploads.maxFiles;

// Ensure the uploads directory exists.
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${cryptoRandom()}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  const extOk = config.uploads.allowedExtensions.includes(ext);
  const mimeOk = config.uploads.allowedMimeTypes.includes(mime);

  if (!extOk) {
    return cb(
      new ApiError(
        400,
        `File type not allowed. Allowed extensions: ${config.uploads.allowedExtensions.join(
          ", "
        )}`
      )
    );
  }

  if (!mimeOk) {
    return cb(
      new ApiError(
        400,
        `File MIME type not allowed: ${mime}. Allowed types: ${config.uploads.allowedMimeTypes.join(
          ", "
        )}`
      )
    );
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_SIZE_BYTES,
    files: MAX_FILES,
  },
  fileFilter,
});

/**
 * Conditional parser: only run Multer when this is a multipart request.
 * Otherwise pass through so JSON bodies are available.
 */
const parseAttachments = (req, res, next) => {
  const type = (req.headers["content-type"] || "").split(";")[0].trim();
  if (type === "multipart/form-data") {
    return upload.array("attachments", MAX_FILES)(req, res, next);
  }
  return next();
};

function cryptoRandom() {
  return require("crypto").randomBytes(8).toString("hex");
}

module.exports = parseAttachments;
