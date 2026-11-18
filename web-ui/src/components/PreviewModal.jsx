import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api } from "../api/client";
import { formatAddress } from "../utils/recipients";
import { plural } from "../utils/format";
import "./PreviewModal.css";

const frameDoc = (html) =>
  `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
  body{margin:0;padding:16px;font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#fff;word-wrap:break-word}
  img{max-width:100%}</style></head><body>${html}</body></html>`;

/**
 * Shows exactly what one recipient will receive (rendered by the server) and
 * lets the user step through recipients before confirming the send.
 */
function PreviewModal({ open, onClose, payload, onSend, sending, simulated }) {
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState({ forIndex: -1, data: null, error: null });

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    api("/emails/preview", { method: "POST", body: { ...payload, index }, signal: ctrl.signal })
      .then((data) => setResult({ forIndex: index, data, error: null }))
      .catch((error) => error.name !== "AbortError" && setResult({ forIndex: index, data: null, error }));
    return () => ctrl.abort();
  }, [open, index, payload]);

  const { data, error } = result;
  const loading = result.forIndex !== index && !error;
  const total = data?.total ?? payload?.to.length ?? 0;
  const m = data?.message;
  const close = () => {
    setIndex(0);
    setResult({ forIndex: -1, data: null, error: null });
    onClose();
  };

  return (
    <Modal
      open={open}
      size="lg"
      title="Preview before sending"
      onClose={sending ? undefined : close}
      footer={
        <>
          <span className="faint mp-preview__foot-note">
            {plural(total, "separate email")} · {simulated ? "simulated, nothing is sent" : "this cannot be undone"}
          </span>
          <button type="button" className="btn" onClick={close} disabled={sending}>
            Keep editing
          </button>
          <button type="button" className="btn btn--primary" onClick={onSend} disabled={sending || !!error || !data}>
            {sending && <span className="spinner" />}
            {sending ? "Starting…" : simulated ? `Simulate sending ${total}` : `Send ${plural(total, "email")}`}
          </button>
        </>
      }
    >
      {error ? (
        <div className="alert alert--bad" role="alert">
          <div>
            <strong>{error.message}</strong>
            {error.details?.length > 1 && (
              <ul>
                {error.details.map((d, i) => (
                  <li key={i}>{d.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="mp-preview">
          <div className="alert alert--info">
            Each recipient gets their own copy with only their address in <strong>To</strong>. Recipients never see each other.
            {data && data.cc.length + data.bcc.length > 0 &&
              ` CC/BCC addresses receive a copy of every message (${plural(total, "copy", "copies")} each).`}
          </div>

          {data?.warnings?.length > 0 && (
            <div className="alert alert--warn">
              <ul style={{ margin: 0 }}>
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mp-preview__nav">
            <button type="button" className="btn btn--sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              ‹ Prev
            </button>
            <select className="select" value={index} onChange={(e) => setIndex(Number(e.target.value))} aria-label="Recipient to preview">
              {(data?.recipients || []).map((r, i) => (
                <option key={r.email + i} value={i}>
                  {i + 1}. {formatAddress(r)}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn--sm" onClick={() => setIndex((i) => Math.min(total - 1, i + 1))} disabled={index >= total - 1}>
              Next ›
            </button>
          </div>

          <div className={`mp-preview__mail${loading ? " is-loading" : ""}`}>
            {m && (
              <>
                <dl className="mp-preview__headers">
                  <dt>From</dt>
                  <dd>{m.from}</dd>
                  <dt>To</dt>
                  <dd>
                    <strong>{m.to.map((a) => formatAddress({ name: a.name, email: a.address })).join(", ")}</strong>
                  </dd>
                  {m.cc.length > 0 && (
                    <>
                      <dt>Cc</dt>
                      <dd>{m.cc.map((a) => a.address).join(", ")}</dd>
                    </>
                  )}
                  {m.bcc.length > 0 && (
                    <>
                      <dt>Bcc</dt>
                      <dd>
                        {m.bcc.map((a) => a.address).join(", ")} <span className="faint">(hidden from recipients)</span>
                      </dd>
                    </>
                  )}
                  <dt>Subject</dt>
                  <dd>
                    <strong>{m.subject}</strong>
                  </dd>
                  {m.attachments.length > 0 && (
                    <>
                      <dt>Files</dt>
                      <dd>📎 {m.attachments.join(", ")}</dd>
                    </>
                  )}
                </dl>
                {m.html ? (
                  <iframe className="mp-preview__frame" title="Message preview" sandbox="" srcDoc={frameDoc(m.html)} />
                ) : (
                  <pre className="mp-preview__text">{m.text}</pre>
                )}
              </>
            )}
            {!m && <div className="skeleton" style={{ height: 260 }} />}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default PreviewModal;
