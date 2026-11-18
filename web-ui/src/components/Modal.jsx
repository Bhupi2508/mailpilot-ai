import { useEffect, useId } from "react";
import "./Modal.css";

/** Accessible dialog: Escape/backdrop closes, body scroll is locked while open. */
function Modal({ open, title, children, onClose, footer, size = "md" }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="mp-modal__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`mp-modal mp-modal--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="mp-modal__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="mp-modal__body">{children}</div>
        {footer && <div className="mp-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
