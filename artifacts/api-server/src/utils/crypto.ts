import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const key = process.env.WEBHOOK_SECRET_KEY || process.env.ACTIVITY_HMAC_SECRET;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "WEBHOOK_SECRET_KEY (or ACTIVITY_HMAC_SECRET) is required in production. " +
        "Encrypted secrets cannot use an ephemeral key — data would be lost on restart.",
      );
    }
    console.warn("[crypto] WARNING: WEBHOOK_SECRET_KEY not set — using ephemeral key (dev only). Set it before deploying.");
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
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
