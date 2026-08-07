/**
 * OAuth request handlers.
 *
 * MailPilot is OAuth-only. The controller exposes:
 *   - GET  /auth/:provider/url      -> provider consent URL + CSRF state
 *   - POST /auth/:provider/callback -> exchange code for MailPilot JWT
 *   - GET  /auth/providers          -> list the user's connected accounts
 *
 * The provider name is passed as a URL parameter, so adding a new
 * provider (Outlook, Zoho, Yahoo, ...) requires no controller changes.
 */
const oauthService = require("../services/oauth/oauthService");
const connectedAccountModel = require("../models/connectedAccountModel");
const config = require("../config");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");

/**
 * @swagger
 * /auth/{provider}/url:
 *   get:
 *     summary: Generate a provider OAuth authorization URL
 *     description: >
 *       Returns a URL the user should be redirected to in order to begin the
 *       OAuth flow (Authorization Code grant). The returned `state` value
 *       should be kept client-side for CSRF protection.
 *     tags: [OAuth]
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema: { type: string }
 *         description: Provider name (google for now).
 *     responses:
 *       200:
 *         description: Authorization URL generated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string }
 *                     state: { type: string }
 *       400:
 *         description: Unsupported provider.
 *       429:
 *         description: Too many requests.
 */
const getAuthUrl = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { url, state } = await oauthService.getAuthUrl(provider);

  new ApiResponse(
    200,
    { url, state },
    `${provider} authorization URL generated.`
  ).send(res);
});

/**
 * @swagger
 * /auth/{provider}/callback:
 *   post:
 *     summary: Complete OAuth sign-in with an authorization code
 *     description: >
 *       Exchanges the provider's authorization code for tokens, finds or
 *       creates the MailPilot user, links the connected account, stores
 *       encrypted provider tokens server-side, and returns ONLY the
 *       MailPilot JWT access token.
 *     tags: [OAuth]
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema: { type: string }
 *         description: Provider name (google for now).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string }
 *               state: { type: string }
 *           example:
 *             code: "4/0AX4Xf...authorization_code..."
 *             state: "random-csrf-state"
 *     responses:
 *       200:
 *         description: Sign-in successful. Returns the MailPilot JWT.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         google_id: { type: string }
 *                         name: { type: string }
 *                         email: { type: string }
 *                         profile_picture: { type: string }
 *                     connectedAccount:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         provider: { type: string }
 *                         email: { type: string }
 *                     accessToken: { type: string }
 *                     expiresIn: { type: number }
 *       400:
 *         description: Missing/invalid code or invalid provider.
 *       409:
 *         description: Provider account already linked to another user.
 */
const handleCallback = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { code } = req.body;

  const { user, connectedAccount, accessToken, expiresIn } =
    await oauthService.handleCallback(provider, code);

  new ApiResponse(
    200,
    { user, connectedAccount, accessToken, expiresIn },
    "Sign-in successful."
  ).send(res);
});

/**
 * Handles the OAuth browser-redirect callback (GET).
 *
 * Providers like Google redirect the user's browser here via GET after
 * consent. This handler exchanges the `code` (from the query string) for
 * tokens, then redirects the browser to the configured frontend URL with the
 * MailPilot JWT and user info so the frontend can complete sign-in.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const handleCallbackGet = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { code, state } = req.query;

  const { user, connectedAccount, accessToken, expiresIn } =
    await oauthService.handleCallback(provider, code);

  const frontendUrl = config.oauth.frontendUrl || "http://localhost:5173";
  const params = new URLSearchParams({
    token: accessToken,
    state: state || "",
    expiresIn: String(expiresIn || ""),
    user: JSON.stringify({
      id: user.id,
      google_id: user.google_id,
      name: user.name,
      email: user.email,
      profile_picture: user.profile_picture,
    }),
    account: JSON.stringify({
      id: connectedAccount.id,
      provider: connectedAccount.provider,
      email: connectedAccount.email,
    }),
  });

  const redirectUrl = `${frontendUrl}?${params.toString()}`;
  return res.redirect(302, redirectUrl);
});

/**
 * @swagger
 * /auth/providers:
 *   get:
 *     summary: List the user's connected provider accounts
 *     tags: [OAuth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Connected provider accounts.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accounts: { type: array, items: { type: object } }
 *       401:
 *         description: Missing or invalid access token.
 */
const listConnectedAccounts = asyncHandler(async (req, res) => {
  const accounts = await connectedAccountModel.findByUserId(req.user.id);
  new ApiResponse(
    200,
    { accounts },
    "Connected provider accounts retrieved successfully."
  ).send(res);
});

module.exports = {
  getAuthUrl,
  handleCallback,
  handleCallbackGet,
  listConnectedAccounts,
};
