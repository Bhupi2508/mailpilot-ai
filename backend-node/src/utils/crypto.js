/**
 * Small crypto helpers.
 *  - AES-256-GCM encryption for OAuth tokens at rest (iv:tag:ciphertext, base64)
 *  - random tokens, SHA-256 hashing and constant-time comparison
 */
const crypto = require("crypto");

function encrypt(plaintext, base64Key) {
  if (plaintext === null || plaintext === undefined) return null;
  const key = Buffer.from(base64Key, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(":");
}

function decrypt(payload, base64Key) {
  if (!payload) return null;
  const [iv, tag, data] = String(payload).split(":").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !data) throw new Error("Invalid encrypted payload.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(base64Key, "base64"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const uuid = () => crypto.randomUUID();

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = { encrypt, decrypt, randomToken, sha256, uuid, safeEqual };
