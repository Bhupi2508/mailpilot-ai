/**
 * User request handlers.
 *
 * Provides the authenticated user's profile. The auth middleware already
 * loads req.user from the verified JWT and DB, so this simply returns it.
 */
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");

/**
 * @swagger
 * /user/profile:
 *   get:
 *     summary: Get the current user's profile
 *     description: Returns the authenticated user's profile information.
 *     tags: [User]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: User profile.
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
 *       401:
 *         description: Missing or invalid access token.
 */
const getProfile = asyncHandler(async (req, res) => {
  new ApiResponse(200, { user: req.user }, "User profile retrieved.").send(res);
});

module.exports = {
  getProfile,
};
