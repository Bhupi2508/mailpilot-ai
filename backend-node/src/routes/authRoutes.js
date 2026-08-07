/**
 * OAuth authentication routes.
 *
 * MailPilot is OAuth-only (Google first; Outlook, Zoho, Yahoo later).
 * Each provider follows the same two-step flow:
 *   GET  /auth/{provider}/url       -> redirect the browser to consent
 *   POST /auth/{provider}/callback  -> exchange code for MailPilot JWT
 */
const { Router } = require("express");
const oauthController = require("../controllers/oauthController");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  oauthCallbackValidator,
  oauthCallbackQueryValidator,
} = require("../validators/oauthValidator");

const router = Router();

// Stricter rate limit on auth endpoints to deter abuse.
router.use(authLimiter);

// --- Provider OAuth flows ---
router.get("/:provider/url", oauthController.getAuthUrl);

// Browser-redirect callback (Google sends the user's browser here via GET
// after consent). Processes the code and redirects to the frontend with the
// MailPilot JWT.
router.get(
  "/:provider/callback",
  validate(oauthCallbackQueryValidator),
  oauthController.handleCallbackGet
);

// API-client callback (exchange code for MailPilot JWT).
router.post(
  "/:provider/callback",
  validate(oauthCallbackValidator),
  oauthController.handleCallback
);

// --- Connected provider accounts (JWT protected) ---
router.get("/providers", auth, oauthController.listConnectedAccounts);

module.exports = router;
