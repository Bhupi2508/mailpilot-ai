/**
 * Dashboard request handlers.
 *
 * Provides aggregate statistics derived from the authenticated user's
 * email_history table.
 */
const emailHistoryModel = require("../models/emailHistoryModel");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics for the current user
 *     description: >
 *       Returns aggregate email statistics (totals, today, separate,
 *       consolidated, success, failure) computed from the user's history.
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Dashboard statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     stats:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         today: { type: integer }
 *                         separate: { type: integer }
 *                         consolidated: { type: integer }
 *                         success: { type: integer }
 *                         failed: { type: integer }
 *       401:
 *         description: Missing or invalid access token.
 */
const getStats = asyncHandler(async (req, res) => {
  const stats = await emailHistoryModel.getStats(req.user.id);

  new ApiResponse(200, { stats }, "Dashboard statistics retrieved.").send(res);
});

module.exports = {
  getStats,
};
