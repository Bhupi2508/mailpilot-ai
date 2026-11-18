import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { BatchBadge, Badge } from "../components/Badge";
import EmptyState from "../components/EmptyState";
import { formatDate } from "../utils/format";

const PAGE_SIZE = 15;

/** All composed emails (batches), searchable by subject and filterable by status. */
function History() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const search = params.get("q") || "";
  const status = params.get("status") || "";
  const [draft, setDraft] = useState(search);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const key = `${page}|${search}|${status}`;

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) q.set("search", search);
    if (status) q.set("status", status);
    let cancelled = false;
    api(`/emails/batches?${q}`)
      .then((data) => !cancelled && setResult({ key, data, error: null }))
      .catch((error) => !cancelled && setResult({ key, data: null, error }));
    return () => {
      cancelled = true;
    };
  }, [key, page, search, status]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  const loading = result.key !== key;
  const { data, error } = result;
  const filtered = search || status;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>History</h1>
          <p>Every email you've composed, with per-recipient results.</p>
        </div>
        <Link to="/compose" className="btn btn--primary">
          Compose
        </Link>
      </div>

      <div className="row">
        <form
          className="row"
          style={{ flex: 1, minWidth: 240 }}
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: draft.trim() });
          }}
          role="search"
        >
          <input
            className="input"
            style={{ flex: 1 }}
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search by subject…"
            aria-label="Search by subject"
          />
          <button type="submit" className="btn">
            Search
          </button>
        </form>
        <select className="select" value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="sending">Sending</option>
          <option value="completed">Completed</option>
          <option value="partial">Partly failed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {error ? (
        <div className="alert alert--bad" role="alert">
          Couldn't load history: {error.message}
        </div>
      ) : loading && !data ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : data.batches.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={filtered ? "🔍" : "📭"}
            title={filtered ? "No matching emails" : "No emails yet"}
            message={filtered ? "Try a different search or status." : "Emails you send will appear here with each recipient's result."}
            action={
              filtered ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setDraft("");
                    setParams({});
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link to="/compose" className="btn btn--primary">
                  Compose an email
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="card card--flush" style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Recipients</th>
                  <th>Accepted</th>
                  <th>Issues</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.batches.map((b) => {
                  const issues = b.counts.failed + b.counts.skipped + b.counts.unknown;
                  return (
                    <tr key={b.id} className="is-link" onClick={() => navigate(`/batches/${b.id}`)}>
                      <td className="td-main">
                        <Link to={`/batches/${b.id}`} className="truncate" style={{ display: "block" }} onClick={(e) => e.stopPropagation()}>
                          {b.subject}
                        </Link>
                        {b.simulated && <Badge tone="demo">Simulated</Badge>}
                      </td>
                      <td data-label="Recipients">{b.total}</td>
                      <td data-label="Accepted">{b.counts.accepted}</td>
                      <td data-label="Issues" className={issues ? "t-bad" : "faint"}>
                        {issues || "—"}
                      </td>
                      <td data-label="Status">
                        <BatchBadge status={b.status} />
                      </td>
                      <td data-label="Created" className="faint">
                        {formatDate(b.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.pagination.totalPages > 1 && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn--sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            ‹ Previous
          </button>
          <span className="faint">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <button type="button" className="btn btn--sm" disabled={page >= data.pagination.totalPages} onClick={() => update({ page: String(page + 1) })}>
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}

export default History;
