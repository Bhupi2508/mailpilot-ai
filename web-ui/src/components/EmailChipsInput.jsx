import { useId, useState } from "react";
import { addRecipients } from "../utils/recipients";
import "./EmailChipsInput.css";

/**
 * Multi-address input with chips.
 * - Type and press Enter, comma or semicolon, or paste a whole list
 *   (one per line, comma separated, or "Name <email>" entries).
 * - Invalid entries stay as red chips; click one to edit it.
 * - Duplicates are skipped with a short notice.
 *
 * value: [{ raw, name, email, error? }]
 */
function EmailChipsInput({ label, value, onChange, max, placeholder, hint, error, required, autoFocus }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");

  const commit = (text) => {
    if (!text.trim()) return;
    const { list, duplicates } = addRecipients(value, text);
    onChange(list);
    setDraft("");
    setNotice(duplicates ? `Skipped ${duplicates} duplicate${duplicates > 1 ? "s" : ""}.` : "");
  };

  const onKeyDown = (e) => {
    if (["Enter", ",", ";"].includes(e.key) || (e.key === "Tab" && draft.trim())) {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e) => {
    const text = e.clipboardData.getData("text");
    if (/[,;\n\t]/.test(text)) {
      e.preventDefault();
      commit(draft + text);
    }
  };

  const edit = (index) => {
    setDraft(value[index].raw);
    onChange(value.filter((_, i) => i !== index));
  };

  const invalid = value.filter((r) => r.error).length;
  const valid = value.length - invalid;
  const over = max && valid > max;

  return (
    <div className="field mp-chips">
      <div className="mp-chips__top">
        <label className="field__label" htmlFor={id}>
          {label}
          {required && <span aria-hidden="true" className="mp-chips__req">*</span>}
        </label>
        {value.length > 0 && (
          <span className="faint">
            {valid} {valid === 1 ? "address" : "addresses"}
            {max ? ` / ${max} max` : ""}
            {" · "}
            <button type="button" className="mp-chips__clear" onClick={() => onChange([])}>
              Clear
            </button>
          </span>
        )}
      </div>
      <div
        className={`mp-chips__box${error || invalid || over ? " is-error" : ""}`}
        onClick={(e) => e.currentTarget.querySelector("input")?.focus()}
      >
        {value.map((r, i) => (
          <span key={`${r.email}-${i}`} className={`mp-chip${r.error ? " is-invalid" : ""}`} title={r.error || r.email}>
            {r.error ? (
              <button type="button" className="mp-chip__text" onClick={() => edit(i)} aria-label={`Edit invalid address ${r.raw}`}>
                {r.raw}
              </button>
            ) : (
              <span className="mp-chip__text">
                {r.name ? (
                  <>
                    <strong>{r.name}</strong> <span className="mp-chip__email">{r.email}</span>
                  </>
                ) : (
                  r.email
                )}
              </span>
            )}
            <button type="button" className="mp-chip__x" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${r.raw}`}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          className="mp-chips__input"
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => commit(draft)}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
        />
      </div>
      {invalid > 0 && (
        <span className="field__error">
          {invalid} invalid {invalid === 1 ? "address" : "addresses"}: click a red chip to fix it, or × to remove it.
        </span>
      )}
      {over && <span className="field__error">Too many addresses: the limit is {max}.</span>}
      {error && <span className="field__error">{error}</span>}
      {notice && <span className="field__hint">{notice}</span>}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

export default EmailChipsInput;
