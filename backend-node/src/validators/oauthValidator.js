/**
 * Validation rules for OAuth endpoints.
 */
const { body, query } = require("express-validator");

const oauthCallbackValidator = [
  body("code").notEmpty().withMessage("OAuth 'code' is required."),
  body("state").optional().isString(),
];

const oauthCallbackQueryValidator = [
  query("code").notEmpty().withMessage("OAuth 'code' is required."),
  query("state").optional().isString(),
];

module.exports = {
  oauthCallbackValidator,
  oauthCallbackQueryValidator,
};
