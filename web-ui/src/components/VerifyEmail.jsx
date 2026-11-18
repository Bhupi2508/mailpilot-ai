import { useEffect, useState } from "react";
import { api } from "../api/client";
import { formatCountdown, toVerification } from "../utils/verification";

/**
 * Registration step 2: enter the 6-digit code emailed to the user.
 * The countdown and resend timer are display only; the server enforces expiry,
 * attempt limits, the resend cooldown and the hourly resend cap.
 */
function VerifyEmail({ initial, onVerified, onBack }) {
  const { email } = initial;
  const [expiresAt, setExpiresAt] = useState(initial.expiresAt);
  const [resendAt, setResendAt] = useState(initial.resendAt);
  const [now, setNow] = useState(initial.receivedAt);
  const [demoCode, setDemoCode] = useState(initial.demoCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expired = left === 0;

  const apply = (state) => {
    const v = toVerification({ email, ...state });
    setNow(v.receivedAt);
    setExpiresAt(v.expiresAt);
    setResendAt(v.resendAt);
    setDemoCode(v.demoCode);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter the 6-digit code from your email.");
    setBusy("verify");
    setError("");
    try {
      onVerified(await api("/auth/verify-otp", { method: "POST", body: { email, code } }));
    } catch (err) {
      setError(err.message);
      if (err.code === "otp_expired" || err.code === "otp_locked") setCode("");
      setBusy(null);
    }
  };

  const resend = async () => {
    setBusy("resend");
    setError("");
    setInfo("");
    try {
      const res = await api("/auth/resend-otp", { method: "POST", body: { email } });
      apply(res.verification);
      setCode("");
      setInfo("We sent a new code. Older codes no longer work.");
    } catch (err) {
      const d = err.details?.[0];
      if (d?.retryAfterSeconds != null) apply({ expiresInSeconds: d.expiresInSeconds ?? 0, resendInSeconds: d.retryAfterSeconds });
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <form className="mp-otp" onSubmit={submit} noValidate>
      <div>
        <h2>Check your email</h2>
        <p className="muted">
          We sent a 6-digit code to <strong>{email}</strong>. Enter it to finish creating your account.
        </p>
      </div>

      {demoCode && (
        <div className="alert alert--warn">
          <strong>Demo mode:</strong> no email is sent. Your code is <code className="mp-otp__demo">{demoCode}</code>
        </div>
      )}
      {info && !error && <div className="alert alert--ok">{info}</div>}
      {error && (
        <div className="alert alert--bad" role="alert">
          {error}
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="otp">
          Verification code
        </label>
        <input
          id="otp"
          className="input mp-otp__input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="••••••"
          value={code}
          autoFocus
          disabled={expired && !busy}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            setError("");
          }}
        />
        <span className={`mp-otp__timer${expired ? " is-expired" : ""}`} role="timer" aria-live="off">
          {expired ? "This code has expired. Request a new one below." : `Code expires in ${formatCountdown(left)}`}
        </span>
      </div>

      <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={!!busy || expired || code.length !== 6}>
        {busy === "verify" && <span className="spinner" />} Verify and continue
      </button>
      <button type="button" className="btn btn--block" onClick={resend} disabled={!!busy || wait > 0}>
        {busy === "resend" && <span className="spinner" />}
        {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
      </button>
      <p className="faint mp-login__switch">
        Wrong address?{" "}
        <button type="button" onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </form>
  );
}

export default VerifyEmail;
