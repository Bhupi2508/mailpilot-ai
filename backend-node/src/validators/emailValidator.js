/**
 * Validation rules for email endpoints.
 */
const { body, query } = require("express-validator");
const config = require("../config");
const {
  normalizeEmailList,
  findInvalidEmails,
} = require("../utils/emailHelper");

const EmailLimits = config.emailLimits;

const validateEmailList = (field, { max, required = false }) => {
  return body(field)
    .optional({ values: required ? undefined : "falsy" })
    .custom((value, { req }) => {
      if (value === undefined && !required) return true;
      if ((value === undefined || value === "") && required) {
        throw new Error(`At least one ${field} recipient is required.`);
      }

      const invalid = findInvalidEmails(value);
      if (invalid.length) {
        throw new Error(
          `Invalid ${field} email: "${invalid[0]}". Please provide valid email addresses.`
        );
      }

      const normalized = normalizeEmailList(value);
      if (normalized.length === 0 && required) {
        throw new Error(`At least one ${field} recipient is required.`);
      }
      if (normalized.length > max) {
        throw new Error(
          `Too many ${field} recipients. Maximum allowed is ${max}.`
        );
      }

      // Store normalized list on the body for downstream use.
      req.body[`${field}_normalized`] = normalized;
      return true;
    });
};

const sendEmailValidator = [
  body("subject")
    .trim()
    .notEmpty()
    .withMessage("Subject is required.")
    .isLength({ max: EmailLimits.maxSubjectLength })
    .withMessage(
      `Subject must be at most ${EmailLimits.maxSubjectLength} characters.`
    ),
  validateEmailList("to", { max: EmailLimits.maxTo, required: true }),
  validateEmailList("cc", { max: EmailLimits.maxCc }),
  validateEmailList("bcc", { max: EmailLimits.maxBcc }),
  body("provider")
    .optional()
    .isIn(["auto", "smtp", "gmail_api"])
    .withMessage("provider must be one of: auto, smtp, gmail_api."),
  body("account_id")
    .optional()
    .isUUID()
    .withMessage("account_id must be a valid UUID."),
  body("body_type")
    .optional()
    .isIn(["html", "text"])
    .withMessage("body_type must be either 'html' or 'text'."),
  body("body")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("body must be a string."),
  // At least one of body (for text) must be present.
  body().custom((_, { req }) => {
    const bodyType = req.body.body_type || "html";
    if (!req.body.body) {
      throw new Error(
        `A ${bodyType} body is required. Provide the 'body' field.`
      );
    }
    return true;
  }),
];

const historyQueryValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer."),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be an integer between 1 and 100."),
];

module.exports = {
  sendEmailValidator,
  historyQueryValidator,
};
