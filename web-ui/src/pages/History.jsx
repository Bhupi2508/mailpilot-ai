import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authFetch, clearSession } from "../api/client";
import Badge from "../components/Badge";
import Skeleton from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { formatDate } from "../utils/email";
import "./History.css";

const ITEMS_PER_PAGE = 10;

function History() {
  const navigate = useNavigate();
  const location = useLocation();
  const [emails, setEmails] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
      });
      if (searchInput.trim()) params.set("search", searchInput.trim());
      if (status !== "all") params.set("status", status);
      if (mode !== "all")
        params.set("mode", mode === "separate" ? "individual" : "shared");

      const data = await authFetch(`/emails/history?${params.toString()}`);
      setEmails(data.emails || []);
      setPagination(data.pagination);
    } catch (err) {
      if (err.status === 401) {
        clearSession();
        navigate("/", { replace: true });
        return;
      }
      setError(err.message || "Failed to load history.");
      setEmails([]);
    } finally {
      setLoading(false);
    }
  };

  // Initial load + reload on filter changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mode]);

  // Open a detail modal when arriving from the dashboard "View" action.
  useEffect(() => {
    if (location.state?.openId) {
      const found = emails.find((e) => e.id === location.state.openId);
      if (found) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelected(found);
      }
      window.history.replaceState({}, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const handleSearch = (e) => {
    e.preventDefault();
    load(1);
  };

  const goToPage = (page) => load(page);

  const statusTone = (s) =>
    s === "sent" ? "success" : s === "failed" ? "danger" : "pending";
  const statusLabel = (s) =>
    s === "sent" ? "Sent" : s === "failed" ? "Failed" : "Pending";

  return (
    <div className="mp-hist">
      <div className="mp-hist__head">
        <h1>Email History</h1>
        <p>Search and filter your sent emails.</p>
      </div>

      {/* Controls */}
      <div className="mp-hist__controls">
        <form className="mp-hist__search" onSubmit={handleSearch}>
          <input
            type="search"
            placeholder="Search by subject…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mp-hist__select"
        >
          <option value="all">All Status</option>
          <option value="sent">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="mp-hist__select"
        >
          <option value="all">All Modes</option>
          <option value="separate">Separate</option>
          <option value="consolidated">Consolidated</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <Skeleton variant="table" rows={6} />
      ) : error ? (
        <div className="mp-hist__error">{error}</div>
      ) : emails.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No emails found"
          message="Try adjusting your search or filters, or send your first email."
        />
      ) : (
        <div className="mp-hist__tablewrap">
          <table className="mp-hist__table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Mode</th>
                <th>Recipients</th>
                <th>Status</th>
                <th>Sent Time</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((em) => (
                <tr key={em.id}>
                  <td className="mp-hist__subject">{em.subject}</td>
                  <td>
                    <Badge
                      tone={em.sending_mode === "individual" ? "info" : "muted"}
                    >
                      {em.sending_mode === "individual"
                        ? "Separate"
                        : "Consolidated"}
                    </Badge>
                  </td>
                  <td>{em.to_recipients?.length ?? 0}</td>
                  <td>
                    <Badge tone={statusTone(em.status)}>
                      {statusLabel(em.status)}
                    </Badge>
                  </td>
                  <td>{formatDate(em.sent_at || em.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="mp-hist__details"
                      onClick={() => setSelected(em)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && pagination.totalPages > 1 && (
        <div className="mp-hist__pagination">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => goToPage(pagination.page - 1)}
          >
            Prev
          </button>
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => goToPage(pagination.page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Detail modal */}
      <Modal
        open={!!selected}
        title="Email Details"
        onClose={() => setSelected(null)}
        footer={
          <button
            type="button"
            className="mp-modal__btn mp-modal__btn--primary"
            onClick={() => setSelected(null)}
          >
            Close
          </button>
        }
      >
        {selected && (
          <div className="mp-hist__detail">
            <div className="mp-hist__detailrow">
              <span>Subject</span>
              <strong>{selected.subject}</strong>
            </div>
            <div className="mp-hist__detailrow">
              <span>Mode</span>
              <strong>
                {selected.sending_mode === "individual"
                  ? "Separate"
                  : "Consolidated"}
              </strong>
            </div>
            <div className="mp-hist__detailrow">
              <span>Status</span>
              <Badge tone={statusTone(selected.status)}>
                {statusLabel(selected.status)}
              </Badge>
            </div>
            <div className="mp-hist__detailrow">
              <span>Sent At</span>
              <strong>
                {formatDate(selected.sent_at || selected.created_at)}
              </strong>
            </div>
            <div className="mp-hist__detailrow">
              <span>To</span>
              <div className="mp-hist__recipients">
                {selected.to_recipients?.map((r) => (
                  <span key={r} className="mp-hist__recipient">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            {selected.cc_recipients?.length > 0 && (
              <div className="mp-hist__detailrow">
                <span>CC</span>
                <div className="mp-hist__recipients">
                  {selected.cc_recipients.map((r) => (
                    <span key={r} className="mp-hist__recipient">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {selected.attachment_count > 0 && (
              <div className="mp-hist__detailrow">
                <span>Attachments</span>
                <strong>{selected.attachment_names?.join(", ")}</strong>
              </div>
            )}
            {selected.error_message && (
              <div className="mp-hist__detailrow">
                <span>Error</span>
                <strong className="mp-hist__error">
                  {selected.error_message}
                </strong>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default History;
