import { useEffect } from "react";
import "./Modal.css";

/**
 * Accessible confirmation/modal dialog.
 * Renders a backdrop + content and locks body scroll while open.
 */
function Modal({ open, title, children, onClose, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mp-modal__backdrop" onClick={onClose}>
      <div
        className="mp-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mp-modal__head">
          <h3>{title}</h3>
          <button
            type="button"
            className="mp-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
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
