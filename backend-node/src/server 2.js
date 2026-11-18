/**
 * Server bootstrap.
 *
 * Starts the HTTP server, verifies DB connectivity, and handles graceful shutdown.
 */
const app = require("./app");
const config = require("./config");
const pool = require("./config/db");
const logger = require("./utils/logger");

const server = app.listen(config.port, () => {
  logger.info(
    `[${config.env}] MailPilot AI API listening on http://localhost:${config.port}${config.apiPrefix}`
  );
  logger.info(
    `Swagger documentation available at http://localhost:${config.port}${config.apiPrefix}/docs`
  );
});

// --- Verify DB connectivity on boot (non-fatal) ---
(async () => {
  try {
    await pool.query("SELECT 1");
    logger.info("[db] PostgreSQL connection established.");
  } catch (err) {
    logger.error("[db] Could not connect to PostgreSQL: " + err.message);
    logger.error("[db] Run migration: node src/db/migrate.js");
  }
})();

// --- Graceful shutdown on SIGINT / SIGTERM ---
function shutdown(signal) {
  logger.info(`\n${signal} received. Closing server...`);
  server.close(async () => {
    try {
      await pool.end();
      logger.info("Database pool closed.");
    } catch (err) {
      logger.error("Error closing database pool: " + err.message);
    }
    logger.info("Server closed. Goodbye!");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = server;
