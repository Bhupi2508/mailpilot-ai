/**
 * Input sanitization helpers.
 *
 * Provides lightweight sanitizers to strip dangerous content from user
 * supplied strings before they are stored or rendered.
 */

/**
 * Escapes HTML special characters in a string.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strips HTML tags from a string.
 *
 * @param {string} value
 * @returns {string}
 */
function stripHtml(value) {
  if (typeof value !== "string") return value;
  return value.replace(/<[^>]*>/g, "");
}

/**
 * Trims whitespace and collapses excessive whitespace/newlines.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeWhitespace(value) {
  if (typeof value !== "string") return value;
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Recursively trims all string values in a plain object / array.
 *
 * @param {*} input
 * @returns {*}
 */
function trimDeep(input) {
  if (typeof input === "string") return input.trim();
  if (Array.isArray(input)) return input.map(trimDeep);
  if (input && typeof input === "object") {
    const out = {};
    Object.keys(input).forEach((k) => {
      out[k] = trimDeep(input[k]);
    });
    return out;
  }
  return input;
}

module.exports = {
  escapeHtml,
  stripHtml,
  normalizeWhitespace,
  trimDeep,
};
