import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Logo from "./Logo";
import "./Layout.css";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/compose", label: "Compose" },
  { to: "/history", label: "History" },
];

/** App shell: top bar, mode banner, page outlet. */
function Layout() {
  const { user, config, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuFor, setMenuFor] = useState(null);
  const menuOpen = menuFor === location.pathname; // closes automatically on navigation

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="mp-app">
      <header className="mp-topbar">
        <div className="mp-topbar__inner">
          <Link to="/dashboard" className="mp-topbar__brand">
            <span className="mp-topbar__logo">
              <Logo />
            </span>
            <span className="mp-topbar__name">
              MailPilot <em>AI</em>
            </span>
          </Link>

          <button
            type="button"
            className="mp-topbar__menu"
            aria-expanded={menuOpen}
            aria-controls="mp-nav"
            onClick={() => setMenuFor(menuOpen ? null : location.pathname)}
          >
            <span className="visually-hidden">Menu</span>
            <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
          </button>

          <nav id="mp-nav" className={`mp-topbar__nav${menuOpen ? " is-open" : ""}`} aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `mp-topbar__link${isActive ? " is-active" : ""}`}>
                {item.label}
              </NavLink>
            ))}
            <div className="mp-topbar__user">
              <span className="mp-topbar__who" title={user?.email}>
                {user?.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span>{(user?.name || "?")[0]}</span>}
                <span className="mp-topbar__email">{user?.email}</span>
              </span>
              <button type="button" className="mp-topbar__logout" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </nav>
        </div>
      </header>

      {config?.simulated && (
        <div className="mp-banner" role="note">
          <strong>Demo mode:</strong> sending is simulated and no email leaves this computer. Addresses ending in{" "}
          <code>@fail.example</code> fail and <code>@flaky.example</code> succeed after a retry.
        </div>
      )}

      <main className="mp-app__main">
        <Outlet />
      </main>

      <footer className="mp-footer">
        MailPilot AI · sends one individual email per recipient ·{" "}
        {config?.simulated ? "demo mode" : `provider: ${config?.emailProvider}`}
      </footer>
    </div>
  );
}

export default Layout;
