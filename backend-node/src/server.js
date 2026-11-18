/**
 * Entry point: validate configuration, open the database (running migrations),
 * start the delivery queue and the HTTP server.
 */
require("dotenv").config({ quiet: true });
const { loadConfig, ConfigError } = require("./config");
const { logger } = require("./utils/logger");

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n${err.message}\n\nFix backend-node/.env (see .env.example) and restart.\n`);
      process.exit(1);
    }
    throw err;
  }
  logger.level = config.logLevel;
  config.warnings.forEach((w) => logger.warn(w));

  const { buildContainer } = require("./container");
  const c = await buildContainer(config);
  await c.queue.start();
  await c.batchService.sweepAttachments();
  await c.otpService.sweep();

  const check = await c.provider.verify();
  if (check.ok) logger.info(`email provider "${c.provider.name}": ${check.message}`);
  else logger.error(`email provider "${c.provider.name}" check FAILED: ${check.message} Sends will fail until this is fixed.`);

  const maintenance = setInterval(() => {
    c.batchService.sweepAttachments().catch((e) => logger.error("attachment sweep failed", { error: e.message }));
    c.authService.sweepSessions().catch((e) => logger.error("session sweep failed", { error: e.message }));
    c.otpService.sweep().catch((e) => logger.error("otp sweep failed", { error: e.message }));
  }, 10 * 60 * 1000);
  maintenance.unref();

  const server = c.app.listen(config.port, () => {
    logger.info(
      `MailPilot API on http://localhost:${config.port} (env=${config.env}, db=${c.db.dialect}, provider=${c.provider.name})`
    );
    if (c.provider.simulated) logger.info("DEMO MODE: emails are simulated. Nothing is sent.");
  });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal} received, shutting down`);
    server.close();
    await c.close().catch((e) => logger.error("shutdown error", { error: e.message }));
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error(`failed to start: ${err.message}`);
  process.exit(1);
});
