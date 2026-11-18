/**
 * Recipient parsing for instant feedback in the composer. Mirrors
 * backend-node/src/services/recipients.js; the server re-validates everything.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

/** Splits on , ; or newline, ignoring separators inside quotes or <...>. */
export function splitAddressList(input) {
  const out = [];
  let cur = "";
  let inQuote = false;
  let inAngle = false;
  for (const ch of String(input)) {
    if (ch === '"' && !inAngle) inQuote = !inQuote;
    else if (ch === "<" && !inQuote) inAngle = true;
    else if (ch === ">" && !inQuote) inAngle = false;
    if (!inQuote && !inAngle && (ch === "," || ch === ";" || ch === "\n" || ch === "\r" || ch === "\t")) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Returns { raw, name, email, error? } for one entry. */
export function parseAddress(raw) {
  const input = String(raw || "").trim();
  let name = "";
  let email = input;
  const angle = /^(.*)<([^<>]+)>\s*$/.exec(input);
  if (angle) {
    name = angle[1].trim().replace(/^"(.*)"$/, "$1").trim();
    email = angle[2].trim();
  } else if (/\s/.test(input)) {
    return { raw: input, name: "", email: input, error: "Not a valid email address." };
  }
  email = email.replace(/^mailto:/i, "").toLowerCase();
  if (!isValidEmail(email)) return { raw: input, name, email, error: "Not a valid email address." };
  if (/["<>\\]/.test(name) || name.length > 100) return { raw: input, name, email, error: "Name contains unsupported characters." };
  return { raw: input, name, email };
}

/** Formats a recipient for display/sending: "Jane Doe <jane@x.com>" or "jane@x.com". */
export function formatAddress({ name, email }) {
  if (!name) return email;
  return /[,;"]/.test(name) ? `"${name}" <${email}>` : `${name} <${email}>`;
}

/**
 * Adds entries parsed from free text to an existing list.
 * Returns { list, added, duplicates }.
 */
export function addRecipients(list, text) {
  const next = [...list];
  const seen = new Set(list.map((r) => r.email));
  let added = 0;
  let duplicates = 0;
  for (const part of splitAddressList(text)) {
    const r = parseAddress(part);
    if (!r.error && seen.has(r.email)) {
      duplicates += 1;
      continue;
    }
    if (!r.error) seen.add(r.email);
    next.push(r);
    added += 1;
  }
  return { list: next, added, duplicates };
}

/**
 * Mirrors the server's sender policy (GET /api/emails/senders): { mode, addresses, domains }.
 * Only used to warn early; the server enforces it.
 */
export function isSenderAllowed(policy, email) {
  if (!policy || policy.mode === "any") return true;
  const e = String(email || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  return at > 0 && (policy.addresses.includes(e) || policy.domains.includes(e.slice(at)));
}
