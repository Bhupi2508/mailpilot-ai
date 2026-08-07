import { useState } from "react";
import { isValidEmail } from "../utils/email";
import "./EmailChipsInput.css";

/**
 * Multi-email input with chips/tags.
 *
 * Supports:
 *  - typing then Enter/comma to add
 *  - pasting comma/newline separated lists
 *  - removing chips
 *  - inline validation (invalid + duplicates)
 *
 * Props:
 *  - value: string[] (emails)
 *  - onChange(emails)
 *  - error: string|string[]
 *  - label, placeholder, required, max
 */
function EmailChipsInput({
  value = [],
  onChange,
  error,
  label,
  placeholder = "name@example.com",
  required = false,
  max,
  hint,
  helperText,
}) {
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);

  const addFromText = (text) => {
    const parts = text
      .split(/[\s,;|]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;

    const next = [...value];
    for (const part of parts) {
      if (isValidEmail(part) && !next.includes(part)) next.push(part);
    }
    onChange(next);
    setDraft("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addFromText(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    addFromText(text);
  };

  const remove = (email) => onChange(value.filter((v) => v !== email));

  const showError = touched && error;
  const maxReached = max && value.length >= max;

  return (
    <div className="mp-chips">
      {label && (
        <label className="mp-chips__label">
          {label}
          {required && <span className="mp-chips__req">*</span>}
        </label>
      )}

      <div
        className={`mp-chips__box${showError ? " mp-chips__box--error" : ""}`}
      >
        {value.map((email) => (
          <span key={email} className="mp-chip">
            {email}
            <button
              type="button"
              className="mp-chip__remove"
              onClick={() => remove(email)}
              aria-label={`Remove ${email}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="mp-chips__input"
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTouched(true);
            if (draft) addFromText(draft);
          }}
          onPaste={handlePaste}
          disabled={maxReached}
        />
      </div>

      {helperText && !showError && (
        <span className="mp-chips__hint">{helperText}</span>
      )}
      {hint && !error && <span className="mp-chips__hint">{hint}</span>}

      {Array.isArray(error)
        ? error.map((e, i) => (
            <span key={i} className="mp-chips__error">
              {e}
            </span>
          ))
        : error && <span className="mp-chips__error">{error}</span>}
    </div>
  );
}

export default EmailChipsInput;
