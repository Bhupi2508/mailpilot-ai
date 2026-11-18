import { useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, googleSignInUrl } from "../api/client";
import { useApp } from "../context/AppContext";
import Logo from "../components/Logo";
import VerifyEmail from "../components/VerifyEmail";
import { toVerification } from "../utils/verification";
import "./Login.css";

const OAUTH_ERRORS = {
  google_denied: "Google sign-in was cancelled.",
  invalid_state: "The sign-in link expired or was tampered with. Please try again.",
  gmail_scope_missing: "MailPilot needs permission to send email from your Gmail account. Please allow it on the Google consent screen.",
  google_error: "Google sign-in failed. Please try again.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.4 0-13.8 4.2-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.5 35 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.9 39.6 16.4 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.6 5.4C41.4 35.8 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

function Login() {
  const { user, config, signedIn } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(OAUTH_ERRORS[params.get("error")] || "");
  const [fieldErrors, setFieldErrors] = useState({});
  const [verify, setVerify] = useState(null); // set while the user is entering their emailed code
  const [unverified, setUnverified] = useState(false);

  if (user) return <Navigate to={location.state?.from || "/dashboard"} replace />;
  const auth = config.auth;

  const run = async (kind, fn) => {
    setBusy(kind);
    setError("");
    setUnverified(false);
    setFieldErrors({});
    try {
      signedIn(await fn());
      navigate(location.state?.from || "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
      setUnverified(err.code === "email_not_verified");
      setFieldErrors(Object.fromEntries((err.details || []).map((d) => [d.field, d.message])));
      setBusy(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode !== "register") return run("password", () => api("/auth/login", { method: "POST", body: form }));
    // Registration only creates an unverified account; the emailed code finishes it.
    setBusy("password");
    setError("");
    setFieldErrors({});
    try {
      const res = await api("/auth/register", { method: "POST", body: form });
      setVerify(toVerification(res.verification));
    } catch (err) {
      setError(err.message);
      setFieldErrors(Object.fromEntries((err.details || []).map((d) => [d.field, d.message])));
    } finally {
      setBusy(null);
    }
  };

  // A user who registered but never verified: get a fresh code and continue.
  const continueVerification = async () => {
    setBusy("verify");
    try {
      const res = await api("/auth/resend-otp", { method: "POST", body: { email: form.email } });
      setVerify(toVerification(res.verification));
    } catch (err) {
      const d = err.details?.[0];
      if (d?.retryAfterSeconds != null) {
        // A code was sent a moment ago: resume with it instead of failing.
        setVerify(toVerification({ email: form.email.trim().toLowerCase(), expiresInSeconds: d.expiresInSeconds ?? 0, resendInSeconds: d.retryAfterSeconds }));
      } else setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const backToSignIn = () => {
    setVerify(null);
    setMode("signin");
    setError("");
    setUnverified(false);
  };

  return (
    <div className="mp-login">
      <section className="mp-login__intro">
        <div className="mp-login__brand">
          <span className="mp-login__logo">
            <Logo size={34} />
          </span>
          MailPilot <em>AI</em>
        </div>
        <h1>One email, sent individually to everyone.</h1>
        <p>
          Write your message once and MailPilot sends a separate, personalized copy to each recipient. Nobody sees who else received it. Then track each
          recipient's result.
        </p>
        <ul>
          <li>✓ Paste a whole list of addresses</li>
          <li>✓ Personalize with names using placeholders</li>
          <li>✓ Preview every copy before sending</li>
          <li>✓ Attachments, CC/BCC, HTML or plain text</li>
        </ul>
      </section>

      <section className="mp-login__panel">
        <div className="card mp-login__card">
          {verify ? (
            <VerifyEmail
              initial={verify}
              onBack={backToSignIn}
              onVerified={(me) => {
                signedIn(me);
                navigate(location.state?.from || "/dashboard", { replace: true });
              }}
            />
          ) : (
            <>
              <h2>{mode === "register" ? "Create your account" : "Sign in"}</h2>

              {error && (
                <div className="alert alert--bad" role="alert">
                  {error}
                  {unverified && (
                    <div className="mp-login__unverified">
                      <button type="button" className="btn btn--sm" onClick={continueVerification} disabled={!!busy}>
                        {busy === "verify" && <span className="spinner" />} Email me a new code
                      </button>
                    </div>
                  )}
                </div>
              )}

              {auth.demo && (
                <div className="mp-login__demo">
                  <button
                    type="button"
                    className="btn btn--primary btn--lg btn--block"
                    disabled={!!busy}
                    onClick={() => run("demo", () => api("/auth/demo", { method: "POST" }))}
                  >
                    {busy === "demo" && <span className="spinner" />} Explore the demo
                  </button>
                  <p className="faint">No email account needed. Sending is simulated; nothing is delivered.</p>
                </div>
              )}

              {auth.google && (
                <a className="btn btn--lg btn--block mp-login__google" href={googleSignInUrl}>
                  <GoogleIcon /> Sign in with Google
                </a>
              )}
              {auth.google && (
                <p className="faint">You'll be asked to allow MailPilot to send email from your Gmail account. MailPilot can't read your inbox.</p>
              )}

              {auth.password && (
                <>
                  {(auth.demo || auth.google) && <div className="mp-login__or">or use an account</div>}
                  <form className="mp-login__form" onSubmit={submit} noValidate>
                    {mode === "register" && (
                      <div className="field">
                        <label className="field__label" htmlFor="name">
                          Name
                        </label>
                        <input id="name" className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                    )}
                    <div className="field">
                      <label className="field__label" htmlFor="email">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        className={`input${fieldErrors.email ? " input--error" : ""}`}
                        autoComplete="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                      {fieldErrors.email && <span className="field__error">{fieldErrors.email}</span>}
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="password">
                        Password
                      </label>
                      <input
                        id="password"
                        type="password"
                        className={`input${fieldErrors.password ? " input--error" : ""}`}
                        autoComplete={mode === "register" ? "new-password" : "current-password"}
                        required
                        minLength={8}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                      />
                      {mode === "register" && !fieldErrors.password && <span className="field__hint">At least 8 characters.</span>}
                      {fieldErrors.password && <span className="field__error">{fieldErrors.password}</span>}
                    </div>
                    <button type="submit" className={`btn btn--block btn--lg${auth.demo ? "" : " btn--primary"}`} disabled={!!busy}>
                      {busy === "password" && <span className="spinner" />}
                      {mode === "register" ? "Create account" : "Sign in"}
                    </button>
                  </form>
                  {auth.registration ? (
                    <p className="faint mp-login__switch">
                      {mode === "register" ? "Already have an account? " : "New here? "}
                      <button type="button" onClick={() => setMode(mode === "register" ? "signin" : "register")}>
                        {mode === "register" ? "Sign in" : "Create an account"}
                      </button>
                    </p>
                  ) : (
                    <p className="faint mp-login__switch">Accounts are created by the administrator of this server.</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default Login;
