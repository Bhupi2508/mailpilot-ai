/**
 * /api/auth: password, demo and Google sign-in, plus session info and logout.
 */
const { Router } = require("express");
const ApiError = require("../utils/ApiError");
const { randomToken, safeEqual } = require("../utils/crypto");
const { logger } = require("../utils/logger");
const { SESSION_COOKIE, cookieOptions } = require("../middleware");

const OAUTH_STATE_COOKIE = "mp_oauth_state";

function authRoutes({ config, authService, otpService, googleOAuth, limiters }) {
  const router = Router();

  async function startSession(res, user) {
    const { token } = await authService.createSession(user.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions(config, config.auth.sessionTtlHours * 3600 * 1000));
  }

  async function me(user) {
    const account = config.authMethods.google && googleOAuth ? await googleOAuth.findAccount(user.id) : null;
    return { user: authService.publicUser(user), connectedAccount: account ? { provider: "google", email: account.provider_email } : null };
  }

  // 200 with user: null when signed out, so a first visit doesn't produce an error.
  router.get("/me", async (req, res) => {
    res.json(req.user ? await me(req.user) : { user: null, connectedAccount: null });
  });

  // Registration creates an UNVERIFIED account and emails a code; there is no session until it is confirmed.
  router.post("/register", limiters.auth, async (req, res) => {
    const user = await authService.register(req.body || {});
    const verification = await otpService.issue(user, { reuseOnCooldown: true });
    res.status(202).json({ verification });
  });

  router.post("/verify-otp", limiters.auth, async (req, res) => {
    const user = await otpService.verify(req.body?.email, req.body?.code);
    await startSession(res, user);
    res.json(await me(user));
  });

  router.post("/resend-otp", limiters.auth, async (req, res) => {
    res.status(202).json({ verification: await otpService.resend(req.body?.email) });
  });

  router.post("/login", limiters.auth, async (req, res) => {
    const user = await authService.login(req.body || {});
    await startSession(res, user);
    res.json(await me(user));
  });

  router.post("/demo", limiters.auth, async (req, res) => {
    const user = await authService.demoUser();
    await startSession(res, user);
    res.json(await me(user));
  });

  router.post("/logout", async (req, res) => {
    await authService.destroySession(req.sessionToken);
    res.clearCookie(SESSION_COOKIE, cookieOptions(config));
    res.status(204).end();
  });

  // --- Google OAuth (EMAIL_PROVIDER=gmail) -----------------------------------
  router.get("/google/start", limiters.auth, (req, res) => {
    if (!config.authMethods.google) throw new ApiError(404, "Google sign-in is not enabled.");
    const state = randomToken(24);
    // Lax so the cookie survives the top-level redirect back from Google.
    res.cookie(OAUTH_STATE_COOKIE, state, { ...cookieOptions(config, 10 * 60 * 1000), sameSite: "lax" });
    res.redirect(302, googleOAuth.authorizationUrl(state));
  });

  router.get("/google/callback", limiters.auth, async (req, res) => {
    if (!config.authMethods.google) throw new ApiError(404, "Google sign-in is not enabled.");
    const fail = (reason) => res.redirect(302, `${config.appUrl}/login?error=${encodeURIComponent(reason)}`);
    const expected = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { ...cookieOptions(config), sameSite: "lax" });

    const { code, state, error } = req.query;
    if (error) return fail(error === "access_denied" ? "google_denied" : "google_error");
    if (typeof code !== "string" || typeof state !== "string" || !expected || !safeEqual(state, expected)) {
      return fail("invalid_state");
    }
    try {
      const user = await googleOAuth.completeSignIn(code);
      await startSession(res, user);
      return res.redirect(302, `${config.appUrl}/dashboard`);
    } catch (err) {
      logger.warn("google sign-in failed", { error: err.message });
      return fail(err.code === "scope_missing" ? "gmail_scope_missing" : "google_error");
    }
  });

  return router;
}

module.exports = { authRoutes };
