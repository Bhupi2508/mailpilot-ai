import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authFetch, getStoredUser, clearSession } from "../api/client";
import StatCard from "../components/StatCard";
import Skeleton from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import Badge from "../components/Badge";
import { formatDate } from "../utils/email";
import "./Dashboard.css";

function Dashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/", { replace: true });
      return;
    }

    const load = async () => {
      try {
        const [statsData, historyData] = await Promise.all([
          authFetch("/dashboard/stats"),
          authFetch("/emails/history?limit=5"),
        ]);
        setStats(statsData.stats);
        setRecent(historyData.emails || []);
      } catch (err) {
        if (err.status === 401) {
          clearSession();
          navigate("/", { replace: true });
          return;
        }
        setError(err.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, navigate]);

  const handleLogout = () => {
    clearSession();
    navigate("/", { replace: true });
    window.location.reload();
  };

  const iconEmail = (
    <svg viewBox="0 0 24 24" fill="none">
      <rect
        x="2"
        y="4"
        width="20"
        height="16"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3 6l9 7 9-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
  const iconSeparate = (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M13 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="5" cy="6" r="1.6" fill="currentColor" />
      <circle cx="5" cy="18" r="1.6" fill="currentColor" />
    </svg>
  );
  const iconConsolidated = (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="6" r="1.6" fill="currentColor" />
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="5" cy="18" r="1.6" fill="currentColor" />
      <path
        d="M10 12h11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
  const iconCheck = (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 12l3 3 5-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  const iconFail = (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9 9l6 6M15 9l-6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );

  return (
    <div className="mp-dash">
      {/* Welcome section */}
      <section className="mp-dash__welcome">
        <div className="mp-dash__profile">
          {user?.profile_picture ? (
            <img
              src={user.profile_picture}
              alt={user.name}
              className="mp-dash__avatar"
            />
          ) : (
            <div className="mp-dash__avatar mp-dash__avatar--fallback">
              {user?.name?.charAt(0) || "U"}
            </div>
          )}
          <div className="mp-dash__meta">
            <h1>Welcome back, {user?.name?.split(" ")[0] || "there"} 👋</h1>
            <p>{user?.email}</p>
          </div>
          <button
            type="button"
            className="mp-dash__logout"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </section>

      {/* Stats */}
      <section className="mp-dash__stats">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="card" height={110} />
          ))
        ) : error ? (
          <div className="mp-dash__error">{error}</div>
        ) : (
          <>
            <StatCard
              label="Total Emails Sent"
              value={stats?.total ?? 0}
              icon={iconEmail}
              tone="sky"
            />
            <StatCard
              label="Separate Emails"
              value={stats?.separate ?? 0}
              icon={iconSeparate}
              tone="violet"
            />
            <StatCard
              label="Consolidated Emails"
              value={stats?.consolidated ?? 0}
              icon={iconConsolidated}
              tone="beacon"
            />
            <StatCard
              label="Successful"
              value={stats?.success ?? 0}
              icon={iconCheck}
              tone="success"
            />
            <StatCard
              label="Failed"
              value={stats?.failed ?? 0}
              icon={iconFail}
              tone="danger"
            />
          </>
        )}
      </section>

      {/* Recent history */}
      <section className="mp-dash__section">
        <div className="mp-dash__section-head">
          <h2>Recent Email History</h2>
          <Link to="/history" className="mp-dash__viewall">
            View all →
          </Link>
        </div>

        {loading ? (
          <Skeleton variant="table" rows={4} />
        ) : error ? (
          <div className="mp-dash__error">{error}</div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon="📭"
            title="No emails sent yet"
            message="Your sent emails will appear here."
            action={
              <Link to="/send/separate" className="mp-dash__cta">
                Send your first email
              </Link>
            }
          />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Mode</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th>Sent Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((em) => (
                  <tr key={em.id}>
                    <td className="mp-table__subject">{em.subject}</td>
                    <td>
                      <Badge
                        tone={
                          em.sending_mode === "individual" ? "info" : "muted"
                        }
                      >
                        {em.sending_mode === "individual"
                          ? "Separate"
                          : "Consolidated"}
                      </Badge>
                    </td>
                    <td>{em.to_recipients?.length ?? 0}</td>
                    <td>
                      <Badge
                        tone={
                          em.status === "sent"
                            ? "success"
                            : em.status === "failed"
                            ? "danger"
                            : "pending"
                        }
                      >
                        {em.status === "sent"
                          ? "Sent"
                          : em.status === "failed"
                          ? "Failed"
                          : "Pending"}
                      </Badge>
                    </td>
                    <td>{formatDate(em.sent_at || em.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="mp-dash__view"
                        onClick={() =>
                          navigate("/history", { state: { openId: em.id } })
                        }
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
      </section>

      {/* Quick actions */}
      <section className="mp-dash__section">
        <h2>Quick Actions</h2>
        <div className="mp-dash__actions">
          <Link
            to="/send/separate"
            className="mp-dash__actioncard mp-dash__actioncard--primary"
          >
            <span className="mp-dash__actionicon" aria-hidden="true">
              {iconSeparate}
            </span>
            <span className="mp-dash__actionbody">
              <span className="mp-dash__actiontitle">Send Separate Emails</span>
              <span className="mp-dash__actiondesc">
                Send an individual email to every recipient.
              </span>
            </span>
          </Link>

          <Link
            to="/send/consolidated"
            className="mp-dash__actioncard mp-dash__actioncard--primary"
          >
            <span className="mp-dash__actionicon" aria-hidden="true">
              {iconConsolidated}
            </span>
            <span className="mp-dash__actionbody">
              <span className="mp-dash__actiontitle">
                Send Consolidated Email
              </span>
              <span className="mp-dash__actiondesc">
                Send one email with multiple recipients.
              </span>
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
