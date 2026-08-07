/**
 * User data access layer.
 *
 * MailPilot is OAuth-only: users are created when they sign in with
 * Google (or a future provider). No passwords are ever stored.
 */
const pool = require("../config/db");

const PUBLIC_FIELDS =
  "id, google_id, name, email, profile_picture, created_at, updated_at";

const userModel = {
  /**
   * Creates a user from an OAuth profile.
   */
  async create({ googleId = null, name, email, profilePicture = null }) {
    const { rows } = await pool.query(
      `INSERT INTO users (google_id, name, email, profile_picture)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PUBLIC_FIELDS}`,
      [googleId, name, email, profilePicture]
    );
    return rows[0];
  },

  /**
   * Finds a user by email (used to find-or-create on OAuth login).
   */
  async findByEmail(email) {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_FIELDS} FROM users WHERE email = $1`,
      [email]
    );
    return rows[0] || null;
  },

  /**
   * Finds a user by Google ID.
   */
  async findByGoogleId(googleId) {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_FIELDS} FROM users WHERE google_id = $1`,
      [googleId]
    );
    return rows[0] || null;
  },

  /**
   * Finds a user by primary key.
   */
  async findById(id) {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * Updates a user's OAuth profile fields.
   */
  async updateProfile(id, { googleId = null, name, profilePicture }) {
    const { rows } = await pool.query(
      `UPDATE users SET
         google_id = COALESCE($2, google_id),
         name = COALESCE($3, name),
         profile_picture = COALESCE($4, profile_picture)
       WHERE id = $1
       RETURNING ${PUBLIC_FIELDS}`,
      [id, googleId, name || null, profilePicture || null]
    );
    return rows[0] || null;
  },
};

module.exports = userModel;
