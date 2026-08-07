/**
 * Dashboard routes (JWT protected).
 */
const { Router } = require("express");
const auth = require("../middleware/auth");
const dashboardController = require("../controllers/dashboardController");

const router = Router();

router.use(auth);

router.get("/stats", dashboardController.getStats);

module.exports = router;
