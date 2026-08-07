/**
 * Application logger.
 *
 * Uses winston. In development, logs are written to the console with
 * colorization. In production, they are additionally written to a file.
 */
const path = require("path");
const fs = require("fs");
const winston = require("winston");
const config = require("../config");

const logDir = path.join(__dirname, "../../logs");
if (config.env === "production") {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(
    ({ timestamp, level, message, stack }) =>
      `${timestamp} [${level.toUpperCase()}] ${stack || message}`
  )
);

const transports = [
  new winston.transports.Console({
    format:
      config.env === "development"
        ? winston.format.combine(winston.format.colorize(), logFormat)
        : logFormat,
  }),
];

if (config.env === "production") {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, "app.log"),
      format: logFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      format: logFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: config.env === "production" ? "info" : "debug",
  transports,
});

module.exports = logger;
