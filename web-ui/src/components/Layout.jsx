import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { clearSession } from "../api/client";
import "./Layout.css";

/** Shared app shell: sticky header, content outlet, professional footer. */
function Layout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearSession();
    navigate("/", { replace: true });
    window.location.reload();
  };

  const navItems = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/history", label: "History" },
    { to: "/send/separate", label: "Separate Email" },
    { to: "/send/consolidated", label: "Consolidated Email" },
  ];

  return (
    <div className="mp-app">
      <header className="mp-topbar">
        <div className="mp-topbar__inner">
          <Link to="/dashboard" className="mp-topbar__brand">
            <span className="mp-topbar__logo" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <circle
                  cx="20"
                  cy="20"
                  r="18"
                  stroke="currentColor"
                  strokeWidth="2"
                  opacity="0.5"
                />
                <path d="M20 6 L25 20 L20 34 L15 20 Z" fill="currentColor" />
                <circle cx="20" cy="20" r="3" fill="var(--mp-navy)" />
              </svg>
            </span>
            <span className="mp-topbar__name">
              MailPilot <em>AI</em>
            </span>
          </Link>

          <nav className="mp-topbar__nav" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `mp-topbar__link${isActive ? " mp-topbar__link--active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            className="mp-topbar__logout"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mp-app__main">
        <Outlet />
      </main>

      <footer className="mp-site-footer">
        <div className="mp-site-footer__inner">
          <div className="mp-site-footer__brand">
            <span className="mp-site-footer__name">
              MailPilot <em>AI</em>
            </span>
            <p>AI-powered email automation platform.</p>
          </div>

          <div className="mp-site-footer__col">
            <h4>Company</h4>
            <a href="#about">About</a>
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms</a>
          </div>

          <div className="mp-site-footer__col">
            <h4>Support</h4>
            <a href="#contact">Contact</a>
            <a href="#support">Support</a>
          </div>

          <div className="mp-site-footer__col">
            <h4>Contact</h4>
            <p>support@mailpilot.ai</p>
            <p>+91 98765 43210</p>
          </div>
        </div>
        <div className="mp-site-footer__bottom">
          © {new Date().getFullYear()} MailPilot AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default Layout;
