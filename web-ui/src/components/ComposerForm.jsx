import { useState } from "react";
import EmailChipsInput from "./EmailChipsInput";
import AttachmentUploader from "./AttachmentUploader";
import "./ComposerForm.css";

/**
 * Reusable email composer form.
 *
 * `mode` is 'separate' or 'consolidated'. Builds a FormData payload and
 * calls `onSubmit(formData)`.
 */
function ComposerForm({ mode, onSubmit, submitting }) {
  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [bcc, setBcc] = useState([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [fileErrors, setFileErrors] = useState([]);
  const [errors, setErrors] = useState({});

  const isSeparate = mode === "separate";

  const validate = () => {
    const next = {};

    if (!to.length) {
      next.to = "At least one recipient is required.";
    }

    if (!subject.trim()) next.subject = "Subject is required.";
    if (!body.trim()) next.body = "Email body is required.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    const fd = new FormData();
    fd.append("subject", subject.trim());
    fd.append("body", body);
    fd.append("body_type", "text");
    to.forEach((em) => fd.append("to", em));
    cc.forEach((em) => fd.append("cc", em));
    bcc.forEach((em) => fd.append("bcc", em));
    files.forEach((f) => fd.append("attachments", f));

    onSubmit(fd);
  };

  return (
    <form className="mp-composer" onSubmit={handleSubmit} noValidate>
      <div className="mp-composer__head">
        <h2>
          {isSeparate ? "Send Separate Emails" : "Send Consolidated Email"}
        </h2>
        <p className="mp-composer__desc">
          {isSeparate
            ? "Each recipient receives an individual email addressed only to them."
            : "One email is sent with all recipients included in the To field."}
        </p>
      </div>

      <EmailChipsInput
        label="To"
        required
        value={to}
        onChange={(v) => setTo(v)}
        error={errors.to}
        placeholder="name@example.com"
        helperText="Enter multiple emails separated by commas or new lines."
      />

      <EmailChipsInput
        label="CC (optional)"
        value={cc}
        onChange={(v) => setCc(v)}
        error={errors.cc}
        placeholder="cc@example.com"
      />

      <EmailChipsInput
        label="BCC (optional)"
        value={bcc}
        onChange={(v) => setBcc(v)}
        error={errors.bcc}
        placeholder="bcc@example.com"
      />

      <div className="mp-composer__field">
        <label className="mp-composer__label" htmlFor="subject">
          Subject<span className="mp-composer__req">*</span>
        </label>
        <input
          id="subject"
          type="text"
          className={`mp-composer__input${
            errors.subject ? " mp-composer__input--error" : ""
          }`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Enter email subject"
          maxLength={200}
        />
        {errors.subject && (
          <span className="mp-composer__err">{errors.subject}</span>
        )}
      </div>

      <div className="mp-composer__field">
        <label className="mp-composer__label" htmlFor="body">
          Email Body<span className="mp-composer__req">*</span>
        </label>
        <textarea
          id="body"
          className={`mp-composer__textarea${
            errors.body ? " mp-composer__textarea--error" : ""
          }`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your email message here…"
          rows={10}
        />
        {errors.body && <span className="mp-composer__err">{errors.body}</span>}
      </div>

      <div className="mp-composer__field">
        <label className="mp-composer__label">Attachments (optional)</label>
        <AttachmentUploader
          files={files}
          setFiles={setFiles}
          onError={setFileErrors}
        />
        {fileErrors.map((err, i) => (
          <span key={i} className="mp-composer__err">
            {err}
          </span>
        ))}
      </div>

      <div className="mp-composer__actions">
        <button
          type="submit"
          className="mp-composer__submit"
          disabled={submitting}
        >
          {submitting
            ? isSeparate
              ? "Sending individually…"
              : "Sending…"
            : isSeparate
            ? "Send Separate Emails"
            : "Send Consolidated Email"}
        </button>
      </div>
    </form>
  );
}

export default ComposerForm;
