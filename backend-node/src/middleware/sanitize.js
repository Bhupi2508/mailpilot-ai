/**
 * Input sanitization middleware.
 *
 * Trims string fields in req.body and strips HTML from plain-text fields
 * to mitigate stored XSS.
 */
const { trimDeep, stripHtml } = require("../utils/sanitize");

const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = trimDeep(req.body);

    // Strip HTML from plain-text fields.
    if (typeof req.body.text === "string") {
      req.body.text = stripHtml(req.body.text);
    }
    if (typeof req.body.name === "string") {
      req.body.name = stripHtml(req.body.name);
    }
  }

  next();
};

module.exports = sanitizeBody;
