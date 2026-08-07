/**
 * JWT authentication middleware.
 *
 * Reads the MailPilot Bearer access token from the Authorization header,
 * verifies it, loads the user from DB, and attaches them to req.user.
 */
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { verifyAccessToken } = require("../services/tokenService");
const userModel = require("../models/userModel");

const auth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    throw new ApiError(
      401,
      "Authentication required. Please provide a valid token."
    );
  }

  const token = header.split(" ")[1];
  const payload = verifyAccessToken(token);

  const user = await userModel.findById(payload.sub);
  if (!user) {
    throw new ApiError(
      401,
      "The user belonging to this token no longer exists."
    );
  }

  req.user = user;
  req.token = token;
  next();
});

module.exports = auth;
