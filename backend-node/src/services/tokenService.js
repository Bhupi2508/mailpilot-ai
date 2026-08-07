/**
 * MailPilot JWT token service.
 *
 * MailPilot issues its OWN short-lived JWT access token to the frontend
 * after a successful OAuth sign-in. Google's access/refresh tokens are
 * stored server-side (encrypted) and are never exposed to the frontend.
 *
 * MVP: single access-token JWT. No refresh-token table or rotation.
 * If longer-lived sessions are needed later, a refresh-token flow can be
 * added without architectural changes.
 */
const jwt = require("jsonwebtoken");
const config = require("../config");
const ApiError = require("../utils/ApiError");

/**
 * Signs a MailPilot JWT access token for a user.
 * @param {string} userId
 * @returns {string}
 */
function signAccessToken(userId) {
  return jwt.sign({ sub: userId, type: "access" }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Verifies a MailPilot JWT access token.
 * @param {string} token
 * @returns {{sub: string, type: string}}
 */
function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.type && payload.type !== "access") {
      throw new ApiError(401, "Invalid token type.");
    }
    return payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, "Invalid or expired token.");
  }
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
