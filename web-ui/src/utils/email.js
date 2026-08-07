/**
 * Email parsing, validation, and formatting helpers for the frontend.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates a single email address. */
export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

/**
 * Parses raw input (comma/newline/semicolon/pipe separated or an array)
 * into a normalized, de-duplicated array of valid email addresses.
 */
export function parseEmails(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : String(value).split(/[\s,;|]+/);
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const email = String(item).trim().toLowerCase();
    if (isValidEmail(email) && !seen.has(email)) {
      seen.add(email);
      result.push(email);
    }
  }
  return result;
}

/** Returns the invalid entries found in raw input. */
export function findInvalidEmails(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : String(value).split(/[\s,;|]+/);
  return items
    .map((item) => String(item).trim())
    .filter((email) => email && !isValidEmail(email));
}

/** Returns duplicates within a raw list (case-insensitive). */
export function findDuplicates(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : String(value).split(/[\s,;|]+/);
  const seen = new Set();
  const dups = new Set();
  for (const item of items) {
    const email = String(item).trim().toLowerCase();
    if (email) {
      if (seen.has(email)) dups.add(email);
      else seen.add(email);
    }
  }
  return Array.from(dups);
}

/** Formats an ISO date string into a readable local date/time. */
export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
