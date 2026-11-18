/**
 * Wires services together. Tests pass their own db/provider through `overrides`.
 */
const { createDatabase } = require("./db");
const { createAuthService } = require("./services/authService");
const { createOtpService } = require("./services/otpService");
const { createBatchService } = require("./services/batchService");
const { createDeliveryQueue } = require("./services/deliveryQueue");
const { createGoogleOAuth } = require("./services/googleOAuth");
const { createProvider } = require("./services/providers");
const { createApp } = require("./app");

async function buildContainer(config, overrides = {}) {
  const db = overrides.db || (await createDatabase(config));
  const googleOAuth = config.authMethods.google ? createGoogleOAuth({ config, db, fetchImpl: overrides.fetchImpl }) : null;
  const provider = overrides.provider || createProvider(config, { googleOAuth });
  const authService = createAuthService({ db, config });
  const otpService = createOtpService({ db, config, provider });
  const batchService = createBatchService({ db, config, provider, googleOAuth });
  const queue = createDeliveryQueue({ db, config, provider, batchService });
  batchService.attachQueue(queue);
  const app = createApp({ config, db, provider, authService, otpService, batchService, googleOAuth });

  return {
    config,
    db,
    provider,
    authService,
    otpService,
    batchService,
    queue,
    app,
    async close() {
      await queue.stop();
      await provider.close?.();
      await db.close();
    },
  };
}

module.exports = { buildContainer };
