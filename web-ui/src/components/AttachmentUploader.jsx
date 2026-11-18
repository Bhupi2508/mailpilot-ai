import { useRef, useState } from "react";
import { formatBytes } from "../utils/format";
import "./AttachmentUploader.css";

/**
 * Attachment picker (click or drag & drop). Limits come from the server's
 * /api/config; the server re-checks type, content and size on upload.
 */
function AttachmentUploader({ files, setFiles, limits }) {
  const inputRef = useRef(null);
  const [errors, setErrors] = useState([]);
  const [dragging, setDragging] = useState(false);
  const { maxFiles, maxFileMb, maxTotalMb, allowedExtensions } = limits;

  const add = (incoming) => {
    const next = [...files];
    const errs = [];
    for (const file of incoming) {
      const ext = file.name.includes(".") ? `.${file.name.split(".").pop().toLowerCase()}` : "";
      if (next.length >= maxFiles) {
        errs.push(`You can attach at most ${maxFiles} files.`);
        break;
      }
      if (!allowedExtensions.includes(ext)) errs.push(`"${file.name}": this file type isn't allowed.`);
      else if (file.size === 0) errs.push(`"${file.name}" is empty.`);
      else if (file.size > maxFileMb * 1024 * 1024) errs.push(`"${file.name}" is larger than ${maxFileMb} MB.`);
      else if (next.some((f) => f.name.toLowerCase() === file.name.toLowerCase())) errs.push(`"${file.name}" is already attached.`);
      else next.push(file);
    }
    const total = next.reduce((a, f) => a + f.size, 0);
    if (total > maxTotalMb * 1024 * 1024) {
      errs.push(`Attachments can total at most ${maxTotalMb} MB.`);
      return setErrors(errs);
    }
    setErrors(errs);
    setFiles(next);
  };

  const total = files.reduce((a, f) => a + f.size, 0);
  if (maxFiles === 0) return null;

  return (
    <div className="field">
      <span className="field__label">Attachments</span>
      <div
        className={`mp-upload${dragging ? " is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(Array.from(e.dataTransfer.files || []));
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={allowedExtensions.join(",")}
          onChange={(e) => {
            add(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
        <button type="button" className="btn btn--sm" onClick={() => inputRef.current?.click()} disabled={files.length >= maxFiles}>
          📎 Add files
        </button>
        <span className="faint">
          or drag them here · up to {maxFiles} files, {maxFileMb} MB each, {maxTotalMb} MB total
        </span>
      </div>
      <span className="field__hint">
        Allowed: {allowedExtensions.map((e) => e.slice(1).toUpperCase()).join(", ")}. Every recipient gets the same attachments.
      </span>
      {files.length > 0 && (
        <ul className="mp-upload__list">
          {files.map((f) => (
            <li key={f.name}>
              <span className="mp-upload__name">📄 {f.name}</span>
              <span className="faint">{formatBytes(f.size)}</span>
              <button type="button" className="icon-btn" onClick={() => setFiles(files.filter((x) => x !== f))} aria-label={`Remove ${f.name}`}>
                ×
              </button>
            </li>
          ))}
          <li className="mp-upload__total faint">Total {formatBytes(total)}</li>
        </ul>
      )}
      {errors.map((e) => (
        <span key={e} className="field__error">
          {e}
        </span>
      ))}
    </div>
  );
}

export default AttachmentUploader;
