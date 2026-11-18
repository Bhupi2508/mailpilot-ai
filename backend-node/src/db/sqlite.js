/**
 * SQLite adapter (default; zero setup). Uses better-sqlite3, which is
 * synchronous; methods are wrapped as async to match the PostgreSQL adapter.
 * Pass ":memory:" for an in-memory database (used by tests).
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function createSqlite(filePath) {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const ops = {
    get: (sql, params = []) => sqlite.prepare(sql).get(...params),
    all: (sql, params = []) => sqlite.prepare(sql).all(...params),
    run: (sql, params = []) => ({ changes: sqlite.prepare(sql).run(...params).changes }),
  };

  // Serialize async transactions so two callers never interleave
  // statements inside one BEGIN/COMMIT on the single connection.
  let chain = Promise.resolve();

  return {
    dialect: "sqlite",
    get: async (sql, params) => ops.get(sql, params),
    all: async (sql, params) => ops.all(sql, params),
    run: async (sql, params) => ops.run(sql, params),
    exec: async (sql) => sqlite.exec(sql),
    transaction(fn) {
      const next = chain.then(async () => {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const tx = {
            get: async (s, p) => ops.get(s, p),
            all: async (s, p) => ops.all(s, p),
            run: async (s, p) => ops.run(s, p),
          };
          const result = await fn(tx);
          sqlite.exec("COMMIT");
          return result;
        } catch (err) {
          sqlite.exec("ROLLBACK");
          throw err;
        }
      });
      chain = next.catch(() => {});
      return next;
    },
    async close() {
      sqlite.close();
    },
  };
}

module.exports = { createSqlite };
