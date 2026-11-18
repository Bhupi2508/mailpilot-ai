/**
 * PostgreSQL adapter (optional; enabled when DATABASE_URL is set).
 * Translates `?` placeholders to `$1, $2, ...`. Queries in this codebase never
 * contain a literal `?`, so the translation is unambiguous.
 */
const { Pool } = require("pg");

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function wrap(client) {
  return {
    async get(sql, params = []) {
      const { rows } = await client.query(toPg(sql), params);
      return rows[0];
    },
    async all(sql, params = []) {
      const { rows } = await client.query(toPg(sql), params);
      return rows;
    },
    async run(sql, params = []) {
      const res = await client.query(toPg(sql), params);
      return { changes: res.rowCount };
    },
  };
}

function createPostgres(url) {
  // TLS is controlled by `?sslmode=...` in DATABASE_URL (parsed by pg).
  const pool = new Pool({ connectionString: url, max: 10 });
  pool.on("error", () => {
    /* idle client errors are surfaced on the next query */
  });

  return {
    dialect: "postgres",
    ...wrap(pool),
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

module.exports = { createPostgres, toPg };
