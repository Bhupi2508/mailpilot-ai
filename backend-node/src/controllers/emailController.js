/**
 * Email request handlers.
 */
const emailService = require("../services/emailService");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");

const sendEmail = asyncHandler(async (req, res) => {
  const {
    subject,
    body_type = "html",
    body,
    to_normalized,
    cc_normalized,
    bcc_normalized,
    provider = "auto",
    account_id,
  } = req.body;
  const files = req.files || [];

  const result = await emailService.send({
    user: req.user,
    subject,
    to: to_normalized || [],
    cc: cc_normalized || [],
    bcc: bcc_normalized || [],
    bodyType: body_type,
    body,
    files,
    provider,
    accountId: account_id,
  });

  new ApiResponse(200, result, "Email sent successfully.").send(res);
});

const sendIndividual = asyncHandler(async (req, res) => {
  const {
    subject,
    body_type = "html",
    body,
    to_normalized,
    cc_normalized,
    bcc_normalized,
    provider = "auto",
    account_id,
  } = req.body;
  const files = req.files || [];

  const result = await emailService.sendIndividual({
    user: req.user,
    subject,
    to: to_normalized || [],
    cc: cc_normalized || [],
    bcc: bcc_normalized || [],
    bodyType: body_type,
    body,
    files,
    provider,
    accountId: account_id,
  });

  new ApiResponse(200, result, "Emails sent successfully.").send(res);
});

const getHistory = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const history = await emailService.getHistory(req.user, { page, limit });

  new ApiResponse(200, history, "Email history retrieved successfully.").send(
    res
  );
});

module.exports = {
  sendEmail,
  sendIndividual,
  getHistory,
};
