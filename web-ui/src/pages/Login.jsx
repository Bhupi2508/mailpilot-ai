import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_PREFIX, getToken, getStoredUser, setSession } from "../api/client";
import "./Login.css";

/**
 * Login / landing page. Handles the Google OAuth callback redirect and
 * renders the "Sign in with Google" card. Preserves the existing OAuth flow.
 */
function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If the user is already authenticated, send them to the dashboard.
  useEffect(() => {
    if (getToken() && getStoredUser()) {
      navigate("/dashboard", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle the OAuth callback redirect (returned from Google with the JWT).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const userParam = params.get("user");

    if (!token || !userParam) return;

    const returnedState = params.get("state");
    const expectedState = sessionStorage.getItem("oauth_state");
    sessionStorage.removeItem("oauth_state");

    if (returnedState && expectedState && returnedState !== expectedState) {
      sessionStorage.removeItem("mailpilot_user");
      sessionStorage.removeItem("jwt");
      window.history.replaceState({}, "", window.location.pathname);
      window.location.reload();
      return;
    }

    let user;
    try {
      user = JSON.parse(userParam);
    } catch {
      user = null;
    }

    setSession({ token, user });
    window.history.replaceState({}, "", window.location.pathname);

    if (user) navigate("/dashboard", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_PREFIX}/auth/google/url`);
      const payload = await res.json();
      if (payload?.data?.url) {
        if (payload.data.state) {
          sessionStorage.setItem("oauth_state", payload.data.state);
        }
        window.location.assign(payload.data.url);
      } else {
        setError("Could not start Google sign-in. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="mp-login">
      <div className="mp-login__card">
        <div className="mp-login__brand">
          <span className="mp-login__logo" aria-hidden="true">
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
              <circle cx="20" cy="20" r="3" fill="#fff" />
            </svg>
          </span>
          <span className="mp-login__name">
            MailPilot <em>AI</em>
          </span>
        </div>

        <span className="mp-login__eyebrow">Welcome back</span>
        <h1>Sign in to MailPilot AI</h1>
        <p className="mp-login__sub">
          Connect your Google account to start sending personalized emails
          through your own inbox. We never store your emails or your
          recipients&apos; data.
        </p>

        {error && (
          <p className="mp-login__error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="mp-login__google"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <svg
            className="mp-login__googleicon"
            viewBox="0 0 48 48"
            aria-hidden="true"
          >
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.4 0-13.8 4.2-17.7 10.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.5 35 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.9 39.6 16.4 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.6 5.4C41.4 35.8 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z"
            />
          </svg>
          {loading ? "Redirecting…" : "Sign in with Google"}
        </button>

        <p className="mp-login__fineprint">
          By continuing you agree to MailPilot AI&apos;s Terms and Privacy
          Policy.
        </p>
      </div>
    </div>
  );
}

export default Login;
