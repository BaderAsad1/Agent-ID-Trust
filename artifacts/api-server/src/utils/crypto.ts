import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { env } from "../lib/env";

const ALGORITHM = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const config = env();
  const key = config.WEBHOOK_SECRET_KEY || config.ACTIVITY_HMAC_SECRET;
  if (!key) {
    if (config.NODE_ENV === "production") {
      throw new Error(
        "WEBHOOK_SECRET_KEY (or ACTIVITY_HMAC_SECRET) is required in production. " +
        "Encrypted secrets cannot use an ephemeral key — data would be lost on restart.",
      );
    }
    cachedKey = randomBytes(32);
    return cachedKey;
  }
  cachedKey = createHash("sha256").update(key).digest();
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    return ciphertext;
  }
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv); // nosemgrep
  decipher.setAuthTag(tag); // Auth tag MUST be set before update/final for GCM auth verification — this is correct usage
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Hash a claim token for safe storage.
 * The raw token is returned to the caller after agent creation; only the
 * SHA-256 hash is stored in the database so a DB leak does not expose live tokens.
 *
 * On lookup, hash the incoming token with this function and compare to the
 * stored hash — identical to how magic-link tokens are handled.
 */
export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

