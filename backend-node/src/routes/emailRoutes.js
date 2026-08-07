/**
 * Email routes (JWT protected).
 */
const { Router } = require("express");
const auth = require("../middleware/auth");
const parseAttachments = require("../middleware/upload");
const validateContentType = require("../middleware/contentType");
const validate = require("../middleware/validate");
const emailController = require("../controllers/emailController");
const {
  sendEmailValidator,
  historyQueryValidator,
} = require("../validators/emailValidator");

const router = Router();

router.use(auth);

router.post(
  "/send",
  validateContentType,
  parseAttachments,
  validate(sendEmailValidator),
  emailController.sendEmail
);

router.post(
  "/send-individual",
  validateContentType,
  parseAttachments,
  validate(sendEmailValidator),
  emailController.sendIndividual
);

// Spec-compliant aliases. "Separate" = individual email per recipient;
// "Consolidated" = one shared email to all recipients.
router.post(
  "/separate",
  validateContentType,
  parseAttachments,
  validate(sendEmailValidator),
  emailController.sendIndividual
);

router.post(
  "/consolidated",
  validateContentType,
  parseAttachments,
  validate(sendEmailValidator),
  emailController.sendEmail
);

router.get(
  "/history",
  validate(historyQueryValidator),
  emailController.getHistory
);

module.exports = router;
