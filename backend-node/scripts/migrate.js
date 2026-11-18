#!/usr/bin/env node
/**
 * Applies pending database migrations (the server also does this on start).
 *
 *   npm run migrate
 */
require("dotenv").config({ quiet: true });
const { loadConfig } = require("../src/config");
const { createDatabase } = require("../src/db");

(async () => {
  const config = loadConfig();
  const db = await createDatabase(config);
  const rows = await db.all("SELECT version, name, applied_at FROM schema_migrations ORDER BY version");
  rows.forEach((r) => console.log(`v${r.version} ${r.name} (applied ${r.applied_at})`));
  console.log(`Database (${db.dialect}) is up to date.`);
  await db.close();
})().catch((err) => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
