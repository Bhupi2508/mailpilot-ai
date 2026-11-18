/**
 * Recipient parsing, validation and de-duplication.
 *
 * Accepts "jane@example.com", "Jane Doe <jane@example.com>" or
 * "\"Doe, Jane\" <jane@example.com>". A field may be an array of such entries
 * or one string separated by commas, semicolons or new lines (separators
 * inside quotes or angle brackets are ignored).
 */

// Practical address check: RFC 5322 "dot-atom" local part, dotted domain with
// a 2-63 letter TLD. Deliberately rejects quoted local parts and IP literals.
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

/** Splits a free-form list on , ; or newline, respecting quotes and <...>. */
function splitAddressList(input) {
  const out = [];
  let cur = "";
  let inQuote = false;
  let inAngle = false;
  for (const ch of String(input)) {
    if (ch === '"' && !inAngle) inQuote = !inQuote;
    else if (ch === "<" && !inQuote) inAngle = true;
    else if (ch === ">" && !inQuote) inAngle = false;
    if (!inQuote && !inAngle && (ch === "," || ch === ";" || ch === "\n" || ch === "\r")) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Parses one entry into { name, email } or { error }. */
function parseAddress(raw) {
  const input = String(raw || "").trim();
  if (!input) return { input, error: "Empty address." };
  if (/[\r\n]/.test(input)) return { input, error: "Line breaks are not allowed." };

  let name = "";
  let email = input;
  const angle = /^(.*)<([^<>]+)>\s*$/.exec(input);
  if (angle) {
    name = angle[1].trim().replace(/^"(.*)"$/, "$1").trim();
    email = angle[2].trim();
  } else if (/\s/.test(input)) {
    return { input, error: `"${input}" is not a valid email address.` };
  }
  email = email.replace(/^mailto:/i, "").toLowerCase();

  if (!isValidEmail(email)) return { input, error: `"${input}" is not a valid email address.` };
  if (name.length > 100) return { input, error: `The name for ${email} is longer than 100 characters.` };
  if (/["<>\\]/.test(name)) return { input, error: `The name for ${email} contains unsupported characters.` };
  return { input, name, email };
}

function toEntries(value) {
  if (value === undefined || value === null || value === "") return [];
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => splitAddressList(item));
}

/**
 * Validates To/CC/BCC together.
 * - Removes duplicates inside each field (case-insensitive).
 * - Drops CC entries that are already in To, and BCC entries already in To or
 *   CC, so nobody receives the same message twice.
 * Returns { to, cc, bcc, errors, warnings }.
 */
function normalizeRecipients({ to, cc, bcc }, limits) {
  const errors = [];
  const warnings = [];
  const fields = { to: [], cc: [], bcc: [] };
  const seen = new Map(); // email -> field it was first seen in
  const labels = { to: "To", cc: "CC", bcc: "BCC" };

  for (const [field, value] of [["to", to], ["cc", cc], ["bcc", bcc]]) {
    let dupes = 0;
    for (const entry of toEntries(value)) {
      const parsed = parseAddress(entry);
      if (parsed.error) {
        errors.push({ field, value: parsed.input, message: parsed.error });
        continue;
      }
      const prev = seen.get(parsed.email);
      if (prev === field) {
        dupes += 1;
        continue;
      }
      if (prev) {
        warnings.push(`${parsed.email} is already in ${labels[prev]}, so it was removed from ${labels[field]}.`);
        continue;
      }
      seen.set(parsed.email, field);
      fields[field].push({ name: parsed.name, email: parsed.email });
    }
    if (dupes) warnings.push(`Removed ${dupes} duplicate ${labels[field]} address${dupes > 1 ? "es" : ""}.`);
  }

  if (!fields.to.length && !errors.some((e) => e.field === "to")) {
    errors.push({ field: "to", message: "Add at least one recipient." });
  }
  const max = { to: limits.maxTo, cc: limits.maxCc, bcc: limits.maxBcc };
  for (const field of ["to", "cc", "bcc"]) {
    if (fields[field].length > max[field]) {
      errors.push({
        field,
        message: `${labels[field]} has ${fields[field].length} addresses; the maximum is ${max[field]}.`,
      });
    }
  }
  return { ...fields, errors, warnings };
}

module.exports = { isValidEmail, splitAddressList, parseAddress, normalizeRecipients, EMAIL_RE };
