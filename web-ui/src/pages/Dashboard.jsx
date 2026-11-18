import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useApp } from "../context/AppContext";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import { BatchBadge } from "../components/Badge";
import { formatDate, plural, PROVIDER_LABEL } from "../utils/format";
import "./Dashboard.css";

function HowItWorks() {
  return (
    <div className="card mp-how">
      <h2>Send one email to many people, individually</h2>
      <p className="muted">
        Write a message once, add your recipients, and MailPilot sends a separate email to each person. Nobody sees anyone else's address.
      </p>
      <ol className="mp-how__steps">
        <li>
          <span>1</span>
          <div>
            <strong>Add recipients</strong>
            <p>Paste a list, e.g. from a spreadsheet column.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Write & personalize</strong>
            <p>
              Use <code>{"{{first_name|there}}"}</code> to greet each person.
            </p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Preview & send</strong>
            <p>Check each copy, then track every recipient's result.</p>
          </div>
        </li>
      </ol>
      <div>
        <Link to="/compose" className="btn btn--primary btn--lg">
          Write your first email
        </Link>
      </div>
    </div>
  );
}

function Dashboard() {
  const { user, config, account } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState({ stats: null, recent: null, error: null });

  useEffect(() => {
    Promise.all([api("/emails/stats"), api("/emails/batches?limit=5")])
      .then(([stats, list]) => setData({ stats, recent: list.batches, error: null }))
      .catch((error) => setData({ stats: null, recent: null, error }));
  }, []);

  const { stats, recent, error } = data;
  const senderText = config.simulated
    ? "Demo mode: sending is simulated."
    : config.emailProvider === "gmail"
      ? `Sending from your Gmail account ${account?.email || ""}.`
      : "Sending through the configured SMTP server.";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Hi {user.name?.split(" ")[0] || "there"} 👋</h1>
          <p>
            {senderText} Provider: {PROVIDER_LABEL[config.emailProvider]}.
          </p>
        </div>
        <Link to="/compose" className="btn btn--primary">
          ✉️ Compose email
        </Link>
      </div>

      {error && (
        <div className="alert alert--bad" role="alert">
          Couldn't load your dashboard: {error.message}
        </div>
      )}

      {!stats && !error ? (
        <div className="stats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 92 }} />
          ))}
        </div>
      ) : stats ? (
        <div className="stats">
          <StatCard label={config.simulated ? "Simulated deliveries" : "Accepted by provider"} value={stats.accepted} tone="ok" />
          <StatCard label="Failed or not sent" value={stats.failed} tone={stats.failed ? "bad" : undefined} hint={stats.unknown ? `${stats.unknown} unknown` : null} />
          <StatCard label="Emails composed" value={stats.batches} hint={`${stats.emails} individual messages`} />
          <StatCard label="Used in last 24 h" value={`${stats.last24h}/${stats.dailyLimit}`} hint={stats.inProgress ? `${stats.inProgress} sending now` : "recipients"} />
        </div>
      ) : null}

      {recent && recent.length === 0 && <HowItWorks />}

      {recent && recent.length > 0 && (
        <div className="card card--flush">
          <div className="card__head mp-dash__head">
            <h2>Recent emails</h2>
            <Link to="/history">View all →</Link>
          </div>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Recipients</th>
                  <th>Result</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((b) => (
                  <tr key={b.id} className="is-link" onClick={() => navigate(`/batches/${b.id}`)}>
                    <td className="td-main">
                      <Link to={`/batches/${b.id}`} className="truncate" style={{ display: "block" }} onClick={(e) => e.stopPropagation()}>
                        {b.subject}
                      </Link>
                    </td>
                    <td data-label="Recipients">{b.total}</td>
                    <td data-label="Result">
                      <span className="t-ok">{b.counts.accepted} ok</span>
                      {b.counts.failed + b.counts.skipped + b.counts.unknown > 0 && (
                        <span className="t-bad"> · {plural(b.counts.failed + b.counts.skipped + b.counts.unknown, "issue")}</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <BatchBadge status={b.status} />
                    </td>
                    <td data-label="Created" className="faint">
                      {formatDate(b.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!recent && !error && <div className="skeleton" style={{ height: 240 }} />}
      {error && <EmptyState icon="⚠️" title="Nothing to show yet" message="Reload the page to try again." />}
    </div>
  );
}

export default Dashboard;
