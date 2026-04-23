// salesforce/crypto.js
// AES-256-GCM token encryption for Salesforce OAuth tokens.
// Stored format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
// Key source: process.env.SF_ENCRYPTION_KEY (32 raw bytes, hex-encoded = 64 chars).
// Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM recommended IV length

function getKey() {
  const hex = process.env.SF_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "SF_ENCRYPTION_KEY missing or invalid (must be 64 hex chars = 32 bytes). " +
      "Generate via: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext) {
  if (plaintext == null) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptToken(blob) {
  if (!blob) return null;
  const parts = String(blob).split(":");
  if (parts.length !== 3) throw new Error("Corrupt encrypted token blob");
  const [ivHex, tagHex, dataHex] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

// PKCE helpers (RFC 7636)
export function generateCodeVerifier() {
  // 43-128 chars, base64url of random bytes
  return crypto.randomBytes(64).toString("base64url");
}

export function codeChallengeFromVerifier(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function randomState() {
  return crypto.randomBytes(24).toString("base64url");
}

// Redact an object's token-like fields before logging. Best-effort.
export function redactForLog(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const redactKeys = new Set([
    "access_token", "refresh_token", "id_token", "authorization",
    "access_token_enc", "refresh_token_enc", "code", "code_verifier",
    "client_secret", "signature",
  ]);
  const clone = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (redactKeys.has(k.toLowerCase())) clone[k] = "[REDACTED]";
    else if (v && typeof v === "object") clone[k] = redactForLog(v);
    else clone[k] = v;
  }
  return clone;
}
