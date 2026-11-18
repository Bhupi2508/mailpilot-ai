import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { BatchBadge, DeliveryBadge, Badge } from "../components/Badge";
import EmptyState from "../components/EmptyState";
import { formatBytes, formatDate, plural, PROVIDER_LABEL } from "../utils/format";
import "./BatchDetail.css";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "problems", label: "Needs attention", match: (s) => ["failed", "skipped", "unknown"].includes(s) },
  { id: "accepted", label: "Accepted", match: (s) => s === "accepted" },
  { id: "pending", label: "Pending", match: (s) => s === "queued" || s === "sending" },
];

function Summary({ batch }) {
  const c = batch.counts;
  const pending = c.queued + c.sending;
  const pct = (n) => `${(n / batch.total) * 100}%`;
  const done = batch.total - pending;
  return (
    <div className="card mp-batch__summary">
      <div className="row">
        <h2>{batch.status === "sending" ? `Sending… ${done} of ${batch.total}` : `${done} of ${batch.total} processed`}</h2>
        <span className="spacer" />
        <BatchBadge status={batch.status} />
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={batch.total} aria-valuenow={done} aria-label="Delivery progress">
        <span className="p-ok" style={{ width: pct(c.accepted) }} />
        <span className="p-bad" style={{ width: pct(c.failed) }} />
        <span className="p-warn" style={{ width: pct(c.skipped + c.unknown) }} />
      </div>
      <div className="mp-batch__counts">
        <span>
          <b className="t-ok">{c.accepted}</b> {batch.simulated ? "simulated" : "accepted"}
        </span>
        <span>
          <b className="t-bad">{c.failed}</b> failed
        </span>
        {c.skipped > 0 && (
          <span>
            <b className="t-warn">{c.skipped}</b> not sent
          </span>
        )}
        {c.unknown > 0 && (
          <span>
            <b className="t-warn">{c.unknown}</b> unknown
          </span>
        )}
        {pending > 0 && (
          <span>
            <b>{pending}</b> pending
          </span>
        )}
      </div>
    </div>
  );
}

function Outcome({ batch }) {
  if (batch.status === "sending") return null;
  const c = batch.counts;
  if (batch.simulated) {
    return (
      <div className="alert alert--warn">
        <span>
          <strong>Simulated.</strong> Demo mode sent nothing; these results show how real delivery would be reported.
        </span>
      </div>
    );
  }
  return (
    <div className={`alert ${c.accepted === batch.total ? "alert--ok" : "alert--info"}`}>
      <span>
        {c.accepted === batch.total ? "Every message was accepted by the mail server. " : ""}
        <strong>Accepted</strong> means the {PROVIDER_LABEL[batch.provider] || batch.provider} server took responsibility for the message; it does not
        guarantee inbox delivery (recipients' servers can still bounce or filter it).
        {c.unknown > 0 && " “Unknown” means the connection broke mid-send, so the message may or may not have gone out. These are never resent automatically."}
      </span>
    </div>
  );
}

function BatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [state, setState] = useState({ batch: null, error: null, forId: null });
  const [filter, setFilter] = useState("all");
  const [retrying, setRetrying] = useState(false);
  const [tick, setTick] = useState(0);
  const warnings = location.state?.warnings || [];

  const { batch, error } = state.forId === id ? state : { batch: null, error: null };
  const sendingNow = batch?.status === "sending";

  useEffect(() => {
    let cancelled = false;
    api(`/emails/batches/${id}`)
      .then((res) => !cancelled && setState({ batch: res.batch, error: null, forId: id }))
      .catch((err) => !cancelled && setState({ batch: null, error: err, forId: id }));
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  // Poll while the batch is still sending.
  useEffect(() => {
    if (!sendingNow) return;
    const t = setTimeout(() => setTick((n) => n + 1), 1500);
    return () => clearTimeout(t);
  }, [sendingNow, batch]);

  const retry = async () => {
    setRetrying(true);
    try {
      const res = await api(`/emails/batches/${id}/retry`, { method: "POST" });
      toast(`Retrying ${plural(res.requeued, "delivery", "deliveries")}…`, "success");
      setTick((n) => n + 1);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setRetrying(false);
    }
  };

  const editAsNew = () =>
    navigate("/compose", {
      state: {
        draft: {
          from: batch.sender,
          to: batch.deliveries.map((d) => ({ name: d.name, email: d.email })),
          cc: batch.cc,
          bcc: batch.bcc,
          subject: batch.subject,
          body: batch.body,
          bodyType: batch.bodyType,
        },
      },
    });

  if (error) {
    return (
      <div className="page page--narrow">
        <EmptyState
          icon={error.status === 404 ? "🔍" : "⚠️"}
          title={error.status === 404 ? "Batch not found" : "Couldn't load this batch"}
          message={error.message}
          action={
            <Link className="btn" to="/history">
              Back to history
            </Link>
          }
        />
      </div>
    );
  }
  if (!batch) {
    return (
      <div className="page page--narrow">
        <div className="skeleton" style={{ height: 40, width: "60%" }} />
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  const f = FILTERS.find((x) => x.id === filter);
  const rows = batch.deliveries.filter((d) => !f.match || f.match(d.status));
  const failedCount = batch.counts.failed + batch.counts.skipped;

  return (
    <div className="page page--narrow mp-batch">
      <div>
        <Link to="/history" className="faint">
          ← History
        </Link>
      </div>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="mp-batch__title">{batch.subject}</h1>
          <p>
            {formatDate(batch.createdAt)} · from {batch.sender} · {PROVIDER_LABEL[batch.provider] || batch.provider}{" "}
            {batch.simulated && <Badge tone="demo">Simulated</Badge>}
          </p>
        </div>
        <div className="row">
          {batch.canRetry && (
            <button type="button" className="btn btn--primary" onClick={retry} disabled={retrying}>
              {retrying && <span className="spinner" />} Retry {plural(failedCount, "failed delivery", "failed deliveries")}
            </button>
          )}
          <button type="button" className="btn" onClick={editAsNew} disabled={sendingNow}>
            Edit & send again
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="alert alert--warn">
          <ul style={{ margin: 0 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <Summary batch={batch} />
      <Outcome batch={batch} />
      {failedCount > 0 && !batch.canRetry && batch.status !== "sending" && batch.attachments.length > 0 && !batch.attachmentsAvailable && (
        <div className="alert alert--info">The attachments for this email have been deleted, so failed deliveries can't be retried. Use “Edit & send again”.</div>
      )}

      <div className="card card--flush">
        <div className="mp-batch__toolbar">
          <h2>Recipients</h2>
          <div className="mp-seg" role="tablist" aria-label="Filter recipients">
            {FILTERS.map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={filter === x.id} className={filter === x.id ? "is-active" : ""} onClick={() => setFilter(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="✓" title="Nothing here" message="No recipients match this filter." />
        ) : (
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="td-main">
                      <div className="mp-batch__who">{d.name ? <strong>{d.name}</strong> : null}</div>
                      <div className={d.name ? "faint" : ""}>{d.email}</div>
                    </td>
                    <td data-label="Status">
                      <DeliveryBadge status={d.status} simulated={batch.simulated} />
                    </td>
                    <td data-label="Details" className="mp-batch__detail">
                      {d.error ? <span className={d.status === "queued" ? "faint" : "t-bad"}>{d.error}</span> : null}
                      {d.status === "accepted" && <span className="faint">{formatDate(d.acceptedAt)}</span>}
                      {d.attempts > 1 && <span className="faint"> · {d.attempts} attempts</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details className="card mp-batch__message">
        <summary>Message details</summary>
        <dl>
          {batch.cc.length > 0 && (
            <>
              <dt>CC (on every email)</dt>
              <dd>{batch.cc.map((r) => r.email).join(", ")}</dd>
            </>
          )}
          {batch.bcc.length > 0 && (
            <>
              <dt>BCC (on every email)</dt>
              <dd>{batch.bcc.map((r) => r.email).join(", ")}</dd>
            </>
          )}
          {batch.attachments.length > 0 && (
            <>
              <dt>Attachments</dt>
              <dd>{batch.attachments.map((a) => `${a.filename} (${formatBytes(a.size)})`).join(", ")}</dd>
            </>
          )}
          <dt>Format</dt>
          <dd>{batch.bodyType === "html" ? "HTML (with plain-text alternative)" : "Plain text"}</dd>
        </dl>
        {batch.bodyType === "html" ? (
          <iframe className="mp-batch__frame" title="Message template" sandbox="" srcDoc={batch.body} />
        ) : (
          <pre className="mp-batch__text">{batch.body}</pre>
        )}
        <p className="faint">This is the template; placeholders were filled in per recipient.</p>
      </details>
    </div>
  );
}

export default BatchDetail;
