/**
 * User routes (JWT protected).
 */
const { Router } = require("express");
const auth = require("../middleware/auth");
const userController = require("../controllers/userController");

const router = Router();

router.use(auth);

router.get("/profile", userController.getProfile);

module.exports = router;
