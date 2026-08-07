import { useEffect, useState } from "react";

const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";
console.log("API_PREFIX:", API_PREFIX);

function Dashboard() {
  // Initialize the user from the OAuth callback URL (if present) or from an
  // existing session in sessionStorage. The URL takes priority because it is
  // only present right after a fresh Google sign-in.
  const [user, setUser] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const userParam = params.get("user");
      if (userParam) return JSON.parse(userParam);
    } catch {
      // ignore malformed JSON
    }
    try {
      return JSON.parse(sessionStorage.getItem("mailpilot_user") || "null");
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Handle the OAuth callback redirect (we came back from Google with the
  // MailPilot JWT in the URL query string). Verify CSRF state and persist the
  // session. This effect only performs side effects — no synchronous setState.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const state = params.get("state");
    const userParam = params.get("user");

    if (!token || !userParam) return;

    const expectedState = sessionStorage.getItem("oauth_state");
    sessionStorage.removeItem("oauth_state");

    if (state && expectedState && state !== expectedState) {
      // Security mismatch: clear any partial session and reload cleanly.
      sessionStorage.removeItem("mailpilot_user");
      sessionStorage.removeItem("jwt");
      window.history.replaceState({}, "", window.location.pathname);
      window.location.reload();
      return;
    }

    sessionStorage.setItem("jwt", token);
    sessionStorage.setItem("mailpilot_user", userParam);

    // Remove OAuth params from the URL (avoid re-processing on refresh).
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const handleGoogleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      console.log(`${API_PREFIX}/auth/google/url`);
      const res = await fetch(`${API_PREFIX}/auth/google/url`);
      console.log("Google sign-in response:", res);
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
    } catch (err) {
      console.error("Google sign-in error:", err);
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("mailpilot_user");
    sessionStorage.removeItem("jwt");
    setUser(null);
  };

  return (
    <div>
      <h1>Welcome to MailPilot AI</h1>
      <p>Send one email to many people — as individual emails.</p>

      <hr />

      {user ? (
        <div>
          <h3>Quick Actions</h3>
          <button>Compose Email</button>
          <button>Email History</button>
          <button>Templates</button>
          <button>Profile</button>

          <hr />

          <div>
            <img
              src={user.profile_picture}
              alt={user.name}
              width={40}
              height={40}
              style={{ borderRadius: "50%" }}
            />
            <strong>{user.name}</strong> ({user.email})
            <br />
            <button onClick={handleLogout}>Sign out</button>
          </div>
        </div>
      ) : (
        <div>
          <h2>Sign in</h2>
          <p>
            MailPilot AI lets you send emails through your own Google account.
          </p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? "Redirecting…" : "Sign in with Google"}
          </button>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
