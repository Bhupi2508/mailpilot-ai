/**
 * Builds the individual message for one recipient.
 *
 * Every message has exactly ONE address in To: the recipient. CC/BCC (if any)
 * are the same small list on every message. Other To recipients are never
 * included, so nobody sees who else received the email.
 *
 * Personalization tokens (subject and body):
 *   {{name}} {{first_name}} {{last_name}} {{email}}
 * with an optional fallback for missing values: {{first_name|there}}
 */
const TOKENS = ["name", "first_name", "last_name", "email"];
const TOKEN_RE = /\{\{\s*([a-z_]+)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/gi;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tokenValues(recipient) {
  const name = (recipient.name || "").trim();
  const [first = "", ...rest] = name.split(/\s+/).filter(Boolean);
  return { name, first_name: first, last_name: rest.join(" "), email: recipient.email };
}

/** Replaces known tokens; unknown tokens are left untouched. */
function personalize(template, recipient, { html = false } = {}) {
  const values = tokenValues(recipient);
  return String(template).replace(TOKEN_RE, (match, key, fallback) => {
    const k = key.toLowerCase();
    if (!TOKENS.includes(k)) return match;
    const value = values[k] || fallback || "";
    return html ? escapeHtml(value) : value;
  });
}

/** Lists problems with tokens, e.g. unknown names or values missing for some recipients. */
function tokenWarnings(texts, recipients) {
  const warnings = [];
  const unknown = new Set();
  let needsName = false;
  for (const text of texts) {
    for (const [, key, fallback] of String(text).matchAll(TOKEN_RE)) {
      const k = key.toLowerCase();
      if (!TOKENS.includes(k)) unknown.add(key);
      else if (k !== "email" && !fallback) needsName = true;
    }
  }
  if (unknown.size) {
    warnings.push(
      `Unknown placeholder${unknown.size > 1 ? "s" : ""} ${[...unknown].map((k) => `{{${k}}}`).join(", ")} will be sent as-is. ` +
        `Supported: ${TOKENS.map((t) => `{{${t}}}`).join(", ")}.`
    );
  }
  const unnamed = recipients.filter((r) => !r.name).length;
  if (needsName && unnamed) {
    warnings.push(
      `${unnamed} recipient${unnamed > 1 ? "s have" : " has"} no name, so name placeholders will be blank for them. ` +
        `Add a fallback like {{first_name|there}} or enter recipients as "Jane Doe <jane@example.com>".`
    );
  }
  return warnings;
}

/** Converts an HTML body into a readable plain-text alternative. */
function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
      const label = text.replace(/<[^>]+>/g, "").trim();
      return label && label !== href ? `${label} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|ul|ol|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param {object} content  { subject, body, bodyType: "html"|"text", cc, bcc }
 * @param {object} recipient { email, name }
 * @param {Array}  attachments [{ filename, contentType, path? }]
 */
function buildMessage(content, recipient, attachments = []) {
  const subject = personalize(content.subject, recipient).replace(/[\r\n]+/g, " ").trim();
  const message = {
    to: [{ name: recipient.name || "", address: recipient.email }],
    cc: (content.cc || []).map((r) => ({ name: r.name || "", address: r.email })),
    bcc: (content.bcc || []).map((r) => ({ name: r.name || "", address: r.email })),
    subject,
    attachments,
  };
  if (content.bodyType === "html") {
    message.html = personalize(content.body, recipient, { html: true });
    message.text = htmlToText(message.html);
  } else {
    message.text = personalize(content.body, recipient);
  }
  return message;
}

module.exports = { buildMessage, personalize, tokenWarnings, htmlToText, escapeHtml, TOKENS };
