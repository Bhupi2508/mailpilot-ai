/**
 * Utility for encrypting/decrypting sensitive data (e.g. OAuth tokens)
 * using AES-256-GCM.
 *
 * Produces a self-contained string of the form:
 *   base64(iv):base64(authTag):base64(ciphertext)
 *
 * A random 12-byte IV is generated for every encryption so identical
 * plaintexts produce different ciphertexts.
 */
const crypto = require("crypto");
const config = require("../config");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const key = config.encryption.key;
  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Set a 32-byte key encoded as base64."
    );
  }
  return Buffer.from(key, "base64");
}

/**
 * Encrypts a string using AES-256-GCM.
 * @param {string} plaintext
 * @returns {string} iv:tag:ciphertext (all base64)
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const text = String(plaintext);
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a string produced by encrypt().
 * @param {string} encrypted
 * @returns {string|null}
 */
function decrypt(encrypted) {
  if (!encrypted) return null;
  const parts = String(encrypted).split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format.");
  }
  const key = getKey();
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const data = Buffer.from(parts[2], "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

module.exports = { encrypt, decrypt };
