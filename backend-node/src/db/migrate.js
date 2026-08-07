/**
 * Database migration runner.
 *
 * Reads schema.sql and executes it against PostgreSQL.
 * Usage: node src/db/migrate.js
 */
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

async function migrate() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  console.log("[db] Running migration...");
  await pool.query(sql);

  console.log("[db] Migration completed successfully.");
}

migrate()
  .catch((err) => {
    console.error("[db] Migration failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
