/**
 * Routes aggregator.
 *
 * Mounts feature-specific routers under the API namespace.
 */
const { Router } = require("express");

const authRoutes = require("./authRoutes");
const emailRoutes = require("./emailRoutes");

const router = Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "MailPilot AI API",
    version: "v1",
  });
});

router.use("/auth", authRoutes);
router.use("/emails", emailRoutes);

module.exports = router;
