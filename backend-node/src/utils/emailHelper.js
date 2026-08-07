/**
 * Email-related helper utilities.
 *
 * Centralizes normalization, deduplication, and recipient parsing so that
 * both the shared and individual email flows stay consistent.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes a value that may be a comma/newline/pipe separated string or an
 * array into a clean, trimmed, lowercased, de-duplicated array of emails.
 *
 * @param {string|string[]} value
 * @returns {string[]}
 */
function normalizeEmailList(value) {
  if (value === null || value === undefined) return [];

  let items = Array.isArray(value) ? value : String(value);

  if (!Array.isArray(items)) {
    // Split on commas, newlines, semicolons, or pipes.
    items = items.split(/[\s,;|]+/);
  }

  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    const email = String(item).trim().toLowerCase();
    if (email && EMAIL_RE.test(email) && !seen.has(email)) {
      seen.add(email);
      result.push(email);
    }
  });

  return result;
}

/**
 * Validates a normalized email list and returns the invalid entries.
 *
 * @param {string|string[]} value
 * @returns {string[]} list of invalid emails found
 */
function findInvalidEmails(value) {
  if (value === null || value === undefined) return [];

  let items = Array.isArray(value) ? value : String(value);
  if (!Array.isArray(items)) {
    items = items.split(/[\s,;|]+/);
  }

  return items
    .map((item) => String(item).trim())
    .filter((email) => email && !EMAIL_RE.test(email));
}

/**
 * Builds a comma-separated display string from an array of emails.
 *
 * @param {string[]} emails
 * @returns {string}
 */
function toDisplayString(emails) {
  return emails.join(", ");
}

/**
 * Validates a single email address.
 *
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

module.exports = {
  normalizeEmailList,
  findInvalidEmails,
  toDisplayString,
  isValidEmail,
  EMAIL_RE,
};
