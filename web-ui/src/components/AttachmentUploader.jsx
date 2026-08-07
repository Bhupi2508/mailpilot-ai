import { useRef } from "react";
import "./AttachmentUploader.css";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".csv", ".txt"];
const ALLOWED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
];
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

/**
 * Attachment uploader supporting PDF/DOC/DOCX/CSV/TXT, max 5 files.
 * `files` is an array of File objects; errors are surfaced via onError.
 */
function AttachmentUploader({ files = [], setFiles, onError }) {
  const inputRef = useRef(null);

  const validateFile = (file) => {
    const name = file.name.toLowerCase();
    const hasExtension = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
    const mimeOk = ALLOWED_MIME.includes((file.type || "").toLowerCase());
    if (!hasExtension) {
      return `"${file.name}" is not allowed. Use PDF, DOC, DOCX, CSV, or TXT.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `"${file.name}" exceeds the ${MAX_ATTACHMENT_SIZE_MB}MB limit.`;
    }
    void mimeOk;
    return null;
  };

  const handleChange = (e) => {
    const selected = Array.from(e.target.files || []);
    const next = [...files];
    const errors = [];

    for (const file of selected) {
      if (next.length >= MAX_ATTACHMENTS) {
        errors.push(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
        break;
      }
      const err = validateFile(file);
      if (err) {
        errors.push(err);
        continue;
      }
      if (next.find((f) => f.name === file.name)) {
        errors.push(`"${file.name}" is already attached.`);
        continue;
      }
      next.push(file);
    }

    if (errors.length) onError?.(errors);
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (name) => setFiles(files.filter((f) => f.name !== name));

  return (
    <div className="mp-upload">
      <div className="mp-upload__box" onClick={() => inputRef.current?.click()}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(",")}
          onChange={handleChange}
          hidden
        />
        <span className="mp-upload__icon" aria-hidden="true">
          📎
        </span>
        <span className="mp-upload__text">
          Click to attach files (PDF, DOC, DOCX, CSV, TXT)
        </span>
        <span className="mp-upload__meta">
          Max {MAX_ATTACHMENTS} files · {MAX_ATTACHMENT_SIZE_MB}MB each
        </span>
      </div>

      {files.length > 0 && (
        <ul className="mp-upload__list">
          {files.map((f) => (
            <li key={f.name} className="mp-upload__item">
              <span className="mp-upload__file">
                <span className="mp-upload__fileicon" aria-hidden="true">
                  📄
                </span>
                <span className="mp-upload__filename">{f.name}</span>
                <span className="mp-upload__size">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
              </span>
              <button
                type="button"
                className="mp-upload__remove"
                onClick={() => remove(f.name)}
                aria-label={`Remove ${f.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AttachmentUploader;
