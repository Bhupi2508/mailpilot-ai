/**
 * PostgreSQL connection pool.
 *
 * A single shared pool is created once and reused across the app.
 * It is closed gracefully on process exit.
 *
 * Supports a DATABASE_URL connection string (Neon, Railway, etc.) which
 * takes precedence over the individual PG* environment variables.
 */
const { Pool } = require("pg");
const config = require("./index");

const poolOptions = {
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

if (config.db.connectionString) {
  poolOptions.connectionString = config.db.connectionString;
} else {
  poolOptions.host = config.db.host;
  poolOptions.port = config.db.port;
  poolOptions.user = config.db.user;
  poolOptions.password = config.db.password;
  poolOptions.database = config.db.database;
}

const pool = new Pool(poolOptions);

// Test connectivity on boot (non-fatal if DB is down).
pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle client:", err.message);
});

module.exports = pool;
