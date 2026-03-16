import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const CLAIM_TOKEN_SECRET = process.env.CLAIM_TOKEN_SECRET;
if (!CLAIM_TOKEN_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("CLAIM_TOKEN_SECRET environment variable is required in production");
  }
  console.warn("WARNING: CLAIM_TOKEN_SECRET not set. Using insecure default for development only.");
}
const SECRET = CLAIM_TOKEN_SECRET || "dev-only-claim-token-secret-not-for-production";

export function generateClaimToken(agentId: string, apiKeyPrefix: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${agentId}:${apiKeyPrefix}:${nonce}`;
  const signature = createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
  const token = Buffer.from(`${payload}:${signature}`).toString("base64url");
  return token;
}

export function verifyClaimToken(token: string): { valid: boolean; agentId?: string; apiKeyPrefix?: string } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 4) {
      return { valid: false };
    }
    const [agentId, apiKeyPrefix, nonce, providedSignature] = parts;
    const payload = `${agentId}:${apiKeyPrefix}:${nonce}`;
    const expectedSignature = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");

    const expected = Buffer.from(expectedSignature, "utf-8");
    const provided = Buffer.from(providedSignature, "utf-8");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      return { valid: false };
    }
    return { valid: true, agentId, apiKeyPrefix };
  } catch {
    return { valid: false };
  }
}
