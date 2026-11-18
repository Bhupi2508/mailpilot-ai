/**
 * Database factory.
 *
 * Every adapter exposes the same small async interface:
 *   get(sql, params)  -> first row or undefined
 *   all(sql, params)  -> array of rows
 *   run(sql, params)  -> { changes }
 *   transaction(fn)   -> runs fn(tx) atomically, where tx has get/all/run
 *   close()
 *
 * SQL is written once with `?` placeholders and portable types (TEXT,
 * INTEGER), so the same queries run on SQLite and PostgreSQL.
 */
const { migrate } = require("./migrations");

async function createDatabase(config) {
  const db = config.db.url
    ? require("./postgres").createPostgres(config.db.url)
    : require("./sqlite").createSqlite(config.db.sqlitePath);
  await migrate(db);
  return db;
}

module.exports = { createDatabase };
