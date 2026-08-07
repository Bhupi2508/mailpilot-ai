import { useEffect } from "react";
import "./Toast.css";

/**
 * A lightweight toast notification with auto-dismiss.
 * `toast` is { type: 'success'|'error'|'info', message } or null.
 */
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className={`mp-toast mp-toast--${toast.type}`} role="status">
      <span className="mp-toast__icon" aria-hidden="true">
        {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}
      </span>
      <span className="mp-toast__msg">{toast.message}</span>
      <button
        type="button"
        className="mp-toast__close"
        onClick={onClose}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default Toast;
