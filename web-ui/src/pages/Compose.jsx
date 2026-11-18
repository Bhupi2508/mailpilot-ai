import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import EmailChipsInput from "../components/EmailChipsInput";
import AttachmentUploader from "../components/AttachmentUploader";
import BodyEditor from "../components/BodyEditor";
import PreviewModal from "../components/PreviewModal";
import { formatAddress, isSenderAllowed, parseAddress } from "../utils/recipients";
import { htmlHasContent, htmlToText, textToHtml } from "../utils/body";
import { plural } from "../utils/format";
import "./Compose.css";

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const toEntries = (list = []) => list.map((r) => parseAddress(formatAddress(r)));

/** Initial form state, optionally from "Edit & send again" on a batch. */
function initialDraft(draft, defaultFrom) {
  return {
    from: draft?.from || defaultFrom,
    to: toEntries(draft?.to),
    cc: toEntries(draft?.cc),
    bcc: toEntries(draft?.bcc),
    subject: draft?.subject || "",
    mode: draft?.bodyType === "text" ? "text" : "rich",
    html: draft?.bodyType === "html" ? draft.body : "",
    text: draft?.bodyType === "text" ? draft.body : "",
  };
}

function Compose() {
  const { config, account, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [form, setForm] = useState(() => initialDraft(location.state?.draft, user.email));
  const [files, setFiles] = useState([]);
  const [showCopies, setShowCopies] = useState(form.cc.length + form.bcc.length > 0);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [preview, setPreview] = useState(null); // payload while the preview is open
  const [sending, setSending] = useState(false);
  const idem = useRef({ fingerprint: null, key: null });

  const { limits, uploads, simulated, emailProvider } = config;

  // Which From addresses the mail server authorizes (the server enforces this; we warn early).
  const [senders, setSenders] = useState(null);
  useEffect(() => {
    let off = false;
    api("/emails/senders")
      .then((s) => !off && setSenders(s))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);
  const fromParsed = parseAddress(form.from || "");
  const fromValid = !fromParsed.error;
  const fromAllowed = !senders || (fromValid && isSenderAllowed(senders, fromParsed.email));
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    // Clear a field's error as soon as the user edits it.
    const keys = Object.keys(patch).map((k) => (k === "cc" || k === "bcc" ? "copies" : k === "html" || k === "text" ? "body" : k));
    if (keys.some((k) => errors[k])) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))));
  };
  const valid = (list) => list.filter((r) => !r.error);
  const bodyType = form.mode === "text" ? "text" : "html";
  const body = bodyType === "text" ? form.text : form.html;

  const changeMode = (mode) => {
    if (mode === "text" && !form.text.trim()) set({ mode, text: htmlToText(form.html) });
    else if (mode !== "text" && !htmlHasContent(form.html) && form.text.trim()) set({ mode, html: textToHtml(form.text) });
    else set({ mode });
  };

  const validate = () => {
    const e = {};
    const to = valid(form.to);
    if (!form.to.length) e.to = "Add at least one recipient.";
    else if (to.length !== form.to.length) e.to = "Fix or remove the invalid addresses.";
    else if (to.length > limits.maxTo) e.to = `You can send to at most ${limits.maxTo} recipients at once.`;
    if (valid(form.cc).length !== form.cc.length || valid(form.bcc).length !== form.bcc.length) e.copies = "Fix or remove invalid CC/BCC addresses.";
    if (form.cc.length > limits.maxCc || form.bcc.length > limits.maxBcc) e.copies = `CC and BCC allow at most ${limits.maxCc} and ${limits.maxBcc} addresses.`;
    if (!fromValid) e.from = "Enter a valid From email address.";
    else if (!fromAllowed) e.from = `${fromParsed.email} isn't authorized by the mail server. Choose an authorized sender.`;
    if (!form.subject.trim()) e.subject = "Add a subject.";
    if (bodyType === "html" ? !htmlHasContent(form.html) : !form.text.trim()) e.body = "Write a message.";
    setErrors(e);
    if (e.copies) setShowCopies(true);
    return Object.keys(e).length === 0;
  };

  const payload = () => ({
    from: form.from.trim(),
    to: valid(form.to).map(formatAddress),
    cc: valid(form.cc).map(formatAddress),
    bcc: valid(form.bcc).map(formatAddress),
    subject: form.subject.trim(),
    body,
    body_type: bodyType,
    attachments: files.map((f) => ({ filename: f.name })),
  });

  const openPreview = (e) => {
    e.preventDefault();
    setServerError(null);
    if (validate()) setPreview(payload());
  };

  const send = async () => {
    const p = preview;
    // Same content => same Idempotency-Key, so a retried click can never send twice.
    const fingerprint = JSON.stringify([p, files.map((f) => [f.name, f.size, f.lastModified])]);
    if (idem.current.fingerprint !== fingerprint) idem.current = { fingerprint, key: newKey() };

    const fd = new FormData();
    fd.append("from", p.from);
    p.to.forEach((v) => fd.append("to", v));
    p.cc.forEach((v) => fd.append("cc", v));
    p.bcc.forEach((v) => fd.append("bcc", v));
    fd.append("subject", p.subject);
    fd.append("body", p.body);
    fd.append("body_type", p.body_type);
    files.forEach((f) => fd.append("attachments", f));

    setSending(true);
    try {
      const res = await api("/emails/send", { method: "POST", body: fd, headers: { "Idempotency-Key": idem.current.key } });
      toast(res.replayed ? "This email was already submitted; showing its progress." : `Sending ${plural(res.batch.total, "individual email")}…`, "success");
      navigate(`/batches/${res.batch.id}`, { state: { warnings: res.warnings } });
    } catch (err) {
      setPreview(null);
      setServerError(err);
      const fieldErrors = {};
      for (const d of err.details || []) {
        const key = d.field === "cc" || d.field === "bcc" ? "copies" : d.field === "body_type" ? "body" : d.field;
        fieldErrors[key] ||= d.message;
      }
      setErrors(fieldErrors);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSending(false);
    }
  };

  const recipients = valid(form.to).length;

  return (
    <div className="page mp-compose">
      <div className="page-head">
        <div>
          <h1>Compose</h1>
          <p>Write one email. Every recipient gets their own private copy.</p>
        </div>
      </div>

      {serverError && (
        <div className="alert alert--bad" role="alert">
          <div>
            <strong>Not sent: {serverError.message}</strong>
            {serverError.details?.length > 1 && (
              <ul>
                {serverError.details.map((d, i) => (
                  <li key={i}>{d.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {emailProvider === "gmail" && !account && (
        <div className="alert alert--warn">Your Google account is not connected. Sign out and sign in with Google again to grant send permission.</div>
      )}

      <div className="mp-compose__grid">
        <form className="card mp-compose__form" onSubmit={openPreview} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="from">
              From<span aria-hidden="true" className="mp-chips__req">*</span>
            </label>
            <input
              id="from"
              className={`input${errors.from || !fromValid || !fromAllowed ? " input--error" : ""}`}
              value={form.from}
              onChange={(e) => set({ from: e.target.value })}
              placeholder={user.email}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="from-hint"
            />
            {!fromValid && form.from.trim() && <span className="field__error">Enter a valid email address.</span>}
            {fromValid && !fromAllowed && (
              <div className="alert alert--warn" role="alert">
                <div>
                  <strong>{fromParsed.email} isn't authorized to send through this mail server.</strong> The email would be rejected.
                  {senders.addresses.length > 0 || senders.domains.length > 0 ? (
                    <>
                      {" "}
                      Use an authorized sender:
                      <div className="row" style={{ marginTop: 8 }}>
                        {senders.addresses.map((a) => (
                          <button key={a} type="button" className="btn btn--sm" onClick={() => set({ from: a })}>
                            {a}
                          </button>
                        ))}
                        {senders.domains.map((d) => (
                          <span key={d} className="badge badge--plain">
                            any address {d}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    " No sender is authorized yet. Ask the administrator to configure one."
                  )}
                </div>
              </div>
            )}
            {errors.from && fromAllowed && fromValid && <span className="field__error">{errors.from}</span>}
            <span id="from-hint" className="field__hint">
              Defaults to your verified email. {simulated ? "Simulated sending accepts any address." : "The mail server must authorize the address you choose, or the send is rejected."}
            </span>
          </div>

          <EmailChipsInput
            label="To"
            required
            autoFocus={!form.to.length}
            value={form.to}
            onChange={(to) => set({ to })}
            max={limits.maxTo}
            error={errors.to}
            placeholder="jane@example.com, Bob Lee <bob@example.com>, …"
            hint="Paste a list from a spreadsheet or type addresses separated by commas or new lines. Each one gets a separate email."
          />

          {!showCopies ? (
            <button type="button" className="mp-compose__link" onClick={() => setShowCopies(true)}>
              + Add CC / BCC
            </button>
          ) : (
            <div className="mp-compose__copies">
              <EmailChipsInput label="CC" value={form.cc} onChange={(cc) => set({ cc })} max={limits.maxCc} placeholder="manager@example.com" />
              <EmailChipsInput label="BCC" value={form.bcc} onChange={(bcc) => set({ bcc })} max={limits.maxBcc} placeholder="archive@example.com" />
              <span className="field__hint">
                CC and BCC are copied on <strong>every</strong> individual email{recipients > 1 ? ` (${recipients} copies each)` : ""}. Recipients can see CC
                addresses but never BCC, and never each other.
              </span>
              {errors.copies && <span className="field__error">{errors.copies}</span>}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="subject">
              Subject<span aria-hidden="true" className="mp-chips__req">*</span>
            </label>
            <input
              id="subject"
              className={`input${errors.subject ? " input--error" : ""}`}
              value={form.subject}
              maxLength={limits.maxSubjectLength}
              onChange={(e) => set({ subject: e.target.value })}
              placeholder="Quick question, {{first_name|there}}"
            />
            {errors.subject && <span className="field__error">{errors.subject}</span>}
          </div>

          <BodyEditor
            mode={form.mode}
            onModeChange={changeMode}
            html={form.html}
            onHtmlChange={(html) => set({ html })}
            text={form.text}
            onTextChange={(text) => set({ text })}
            error={errors.body}
          />

          <AttachmentUploader files={files} setFiles={setFiles} limits={uploads} />

          <div className="mp-compose__actions">
            <span className="faint">{recipients ? `${plural(recipients, "recipient")} → ${plural(recipients, "separate email")}` : "No recipients yet"}</span>
            <button type="submit" className="btn btn--primary btn--lg">
              Preview & send
            </button>
          </div>
        </form>

        <aside className="mp-compose__aside">
          <div className="card">
            <h3>How it works</h3>
            <ol className="mp-steps">
              <li>
                <strong>Add recipients.</strong> Paste a whole list; duplicates are removed automatically.
              </li>
              <li>
                <strong>Write once.</strong> Use placeholders like <code>{"{{first_name|there}}"}</code> to personalize each copy.
              </li>
              <li>
                <strong>Preview.</strong> Step through exactly what each person will receive.
              </li>
              <li>
                <strong>Send.</strong> MailPilot sends one email per recipient and shows the result for each.
              </li>
            </ol>
          </div>
          {simulated && (
            <div className="card mp-compose__demo">
              <h3>Try the demo outcomes</h3>
              <p className="faint">
                <code>name@fail.example</code> → rejected
                <br />
                <code>name@flaky.example</code> → fails once, then retried and accepted
                <br />
                anything else → accepted (simulated)
              </p>
            </div>
          )}
        </aside>
      </div>

      <PreviewModal open={!!preview} payload={preview} onClose={() => setPreview(null)} onSend={send} sending={sending} simulated={simulated} />
    </div>
  );
}

export default Compose;
