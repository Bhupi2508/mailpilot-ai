import { useRef, useState } from "react";
import "./BodyEditor.css";

const MODES = [
  { id: "rich", label: "Formatted" },
  { id: "html", label: "HTML" },
  { id: "text", label: "Plain text" },
];

const TOKENS = [
  { token: "{{first_name|there}}", label: "First name" },
  { token: "{{name}}", label: "Full name" },
  { token: "{{email}}", label: "Email" },
];

const TOOLS = [
  { cmd: "bold", label: "B", title: "Bold", style: { fontWeight: 700 } },
  { cmd: "italic", label: "I", title: "Italic", style: { fontStyle: "italic" } },
  { cmd: "underline", label: "U", title: "Underline", style: { textDecoration: "underline" } },
  { cmd: "insertUnorderedList", label: "• List", title: "Bulleted list" },
  { cmd: "insertOrderedList", label: "1. List", title: "Numbered list" },
  { cmd: "createLink", label: "Link", title: "Insert link" },
  { cmd: "removeFormat", label: "Clear", title: "Remove formatting" },
];

/** contentEditable editor. Uncontrolled after mount so the caret never jumps. */
function RichArea({ html, onChange, editorRef, invalid }) {
  const [initial] = useState(html);
  const exec = (cmd, arg) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(editorRef.current.innerHTML);
  };
  const onTool = (tool) => {
    if (tool.cmd !== "createLink") return exec(tool.cmd);
    const url = window.prompt("Link URL (https://…)", "https://");
    if (url && /^(https?:|mailto:)/i.test(url.trim())) exec("createLink", url.trim());
  };
  return (
    <div className={`mp-editor${invalid ? " is-error" : ""}`}>
      <div className="mp-editor__toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t) => (
          <button key={t.cmd} type="button" title={t.title} style={t.style} onMouseDown={(e) => e.preventDefault()} onClick={() => onTool(t)}>
            {t.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className="mp-editor__area"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Message"
        data-placeholder="Hi {{first_name|there}}, …"
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: initial }}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onPaste={(e) => {
          // Paste as plain text: avoids pasting styles/scripts from other pages.
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
      />
    </div>
  );
}

function BodyEditor({ mode, onModeChange, html, onHtmlChange, text, onTextChange, error }) {
  const richRef = useRef(null);
  const textRef = useRef(null);

  const insertToken = (token) => {
    if (mode === "rich") {
      const el = richRef.current;
      el.focus();
      const sel = window.getSelection();
      if (!sel.rangeCount || !el.contains(sel.anchorNode)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      document.execCommand("insertText", false, token);
      onHtmlChange(el.innerHTML);
      return;
    }
    const el = textRef.current;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    (mode === "html" ? onHtmlChange : onTextChange)(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="field">
      <div className="mp-body__top">
        <span className="field__label" id="body-label">
          Message<span aria-hidden="true" className="mp-chips__req">*</span>
        </span>
        <div className="mp-seg" role="tablist" aria-label="Message format">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? "is-active" : ""} onClick={() => onModeChange(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "rich" && <RichArea html={html} onChange={onHtmlChange} editorRef={richRef} invalid={!!error} />}
      {mode !== "rich" && (
        <textarea
          ref={textRef}
          aria-labelledby="body-label"
          className={`textarea${mode === "html" ? " textarea--mono" : ""}${error ? " textarea--error" : ""}`}
          value={mode === "html" ? html : text}
          onChange={(e) => (mode === "html" ? onHtmlChange : onTextChange)(e.target.value)}
          placeholder={mode === "html" ? "<p>Hi {{first_name|there}},</p>\n<p>…</p>" : "Hi {{first_name|there}},\n\n…"}
          rows={12}
          spellCheck={mode !== "html"}
        />
      )}

      <div className="mp-tokens">
        <span className="faint">Personalize:</span>
        {TOKENS.map((t) => (
          <button key={t.token} type="button" className="mp-token" onMouseDown={(e) => e.preventDefault()} onClick={() => insertToken(t.token)}>
            + {t.label}
          </button>
        ))}
      </div>
      <span className="field__hint">
        Placeholders are filled in for each recipient. <code>{"{{first_name|there}}"}</code> uses "there" when a recipient has no name. Add names as{" "}
        <code>Jane Doe &lt;jane@example.com&gt;</code>.
      </span>
      {error && <span className="field__error">{error}</span>}
    </div>
  );
}

export default BodyEditor;
