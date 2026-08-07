/**
 * Validation middleware.
 *
 * Runs an array of express-validator chains, then checks for errors.
 * If errors exist, returns a 400 with the details.
 */
const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map((v) => v.run(req)));

  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const details = errors.array().map((e) => ({
    field: e.param,
    message: e.msg,
    value: e.value,
  }));

  return next(new ApiError(400, "Validation failed.", details));
};

module.exports = validate;
