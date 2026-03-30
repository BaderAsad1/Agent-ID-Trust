/**
 * Claim-ticket service for delayed handle NFT claims.
 *
 * A claim ticket is a short-lived signed JWT that authorises a specific wallet
 * address to claim custodianship of an already-anchored handle.  It is issued
 * immediately after a Stripe checkout or crypto payment is confirmed, before
 * the user has supplied a wallet address, so the user can supply the wallet
 * later without re-proving payment.
 *
 * Env vars:
 *   HANDLE_CLAIM_SIGNING_PRIVATE_KEY  — HMAC-SHA256 secret (hex or plain)
 *   HANDLE_CLAIM_ISSUER               — issuer string (default: "agentid-api")
 *   HANDLE_CLAIM_MAX_AGE_SECONDS      — ticket TTL in seconds (default: 900 = 15 min)
 */

import { createHmac, randomUUID } from "crypto";
import { logger } from "../middlewares/request-logger";

const DEFAULT_ISSUER = "agentid-api";
const DEFAULT_MAX_AGE_SECONDS = 900; // 15 minutes

// JTI replay prevention via Redis SETNX (distributed-safe).
// Falls back to an in-memory Set if Redis is unavailable (dev/test without Redis).
// Redis key format: "claim:jti:<jti>"  with TTL = ticket's remaining exp seconds.
//
// SETNX semantics: the Redis SET command with NX+EX is atomic — exactly one
// concurrent caller wins (returns "OK"), all others get null, so replay is
// rejected even across multiple API server instances.

const usedJtisFallback = new Set<string>(); // process-local fallback only

/**
 * Attempt to atomically consume a JTI using Redis SETNX.
 * Returns true if this is the FIRST use (safe to proceed).
 * Returns false if the JTI has already been consumed (replay).
 */
async function consumeJti(jti: string, ttlSeconds: number): Promise<boolean> {
  try {
    const { getRedis } = await import("../lib/redis");
    const redis = getRedis();
    const key = `claim:jti:${jti}`;
    const ttl = Math.max(1, Math.ceil(ttlSeconds));
    const result = await redis.set(key, "1", "EX", ttl, "NX");
    return result === "OK";
  } catch {
    // Redis unavailable — fall back to in-memory set (single-instance only)
    if (usedJtisFallback.has(jti)) return false;
    usedJtisFallback.add(jti);
    return true;
  }
}

/**
 * Check (without consuming) if a JTI has been used.
 * Used for pre-validation before the consume step.
 */
async function isJtiUsed(jti: string): Promise<boolean> {
  try {
    const { getRedis } = await import("../lib/redis");
    const redis = getRedis();
    const exists = await redis.exists(`claim:jti:${jti}`);
    return exists === 1;
  } catch {
    return usedJtisFallback.has(jti);
  }
}

export interface ClaimTicketPayload {
  jti: string;
  iss: string;
  sub: string;         // agentId
  handle: string;
  iat: number;
  exp: number;
  wallet?: string;     // bound wallet (optional at issuance, required at validation)
}

function signingKey(): Buffer | null {
  const raw = process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY;
  if (!raw) return null;
  // If the key starts with "0x" it is hex-encoded; otherwise treat as plain UTF-8 string.
  if (raw.startsWith("0x") || raw.startsWith("0X")) {
    return Buffer.from(raw.slice(2), "hex");
  }
  return Buffer.from(raw, "utf8");
}

function issuer(): string {
  return process.env.HANDLE_CLAIM_ISSUER ?? DEFAULT_ISSUER;
}

function maxAgeSeconds(): number {
  const v = Number(process.env.HANDLE_CLAIM_MAX_AGE_SECONDS);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MAX_AGE_SECONDS;
}

function base64urlEncode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function hmacSign(data: string, key: Buffer): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

/**
 * Issue a signed claim ticket for a handle.
 * Returns null if HANDLE_CLAIM_SIGNING_PRIVATE_KEY is not configured.
 */
export function issueClaimTicket(opts: {
  agentId: string;
  handle: string;
  wallet?: string;
}): string | null {
  const key = signingKey();
  if (!key) {
    logger.debug("[claim-ticket] HANDLE_CLAIM_SIGNING_PRIVATE_KEY not set — claim ticket not issued");
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: ClaimTicketPayload = {
    jti: randomUUID(),
    iss: issuer(),
    sub: opts.agentId,
    handle: opts.handle,
    iat: now,
    exp: now + maxAgeSeconds(),
    ...(opts.wallet ? { wallet: opts.wallet.toLowerCase() } : {}),
  };

  const header = base64urlEncode({ alg: "HS256", typ: "claim-ticket" });
  const body = base64urlEncode(payload);
  const sig = hmacSign(`${header}.${body}`, key);

  return `${header}.${body}.${sig}`;
}

export type ClaimTicketValidationResult =
  | { ok: true; payload: ClaimTicketPayload }
  | { ok: false; error: string };

/**
 * Verify a claim ticket WITHOUT consuming its JTI.
 *
 * Use this when you need to check the ticket is valid before performing
 * side-effecting operations (e.g. on-chain calls). After all operations
 * succeed, call `consumeClaimTicketJti()` to atomically mark the ticket used.
 *
 * If you call this concurrently with the same ticket from two threads, both
 * could proceed — use `validateClaimTicket()` (verify + consume together) only
 * for simple idempotent routes where a double-execution is acceptable.
 */
export async function verifyClaimTicket(token: string, opts?: {
  wallet?: string;
  expectedAgentId?: string;
  expectedHandle?: string;
}): Promise<ClaimTicketValidationResult> {
  const key = signingKey();
  if (!key) {
    return { ok: false, error: "Claim ticket signing not configured on this server" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Malformed claim ticket" };
  }
  const [header, body, sig] = parts;

  // Verify signature
  const expectedSig = hmacSign(`${header}.${body}`, key);
  if (sig !== expectedSig) {
    return { ok: false, error: "Invalid claim ticket signature" };
  }

  // Decode payload
  let payload: ClaimTicketPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ClaimTicketPayload;
  } catch {
    return { ok: false, error: "Malformed claim ticket payload" };
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return { ok: false, error: "Claim ticket has expired" };
  }

  // Check issuer
  if (payload.iss !== issuer()) {
    return { ok: false, error: "Claim ticket issuer mismatch" };
  }

  // Optional: wallet binding
  if (opts?.wallet && payload.wallet && opts.wallet.toLowerCase() !== payload.wallet) {
    return { ok: false, error: "Claim ticket wallet binding mismatch" };
  }

  // Optional: agentId binding
  if (opts?.expectedAgentId && payload.sub !== opts.expectedAgentId) {
    return { ok: false, error: "Claim ticket agentId mismatch" };
  }

  // Optional: handle binding
  if (opts?.expectedHandle && payload.handle !== opts.expectedHandle) {
    return { ok: false, error: "Claim ticket handle mismatch" };
  }

  // Check whether JTI has already been consumed (READ-ONLY — does not consume).
  const alreadyUsed = await isJtiUsed(payload.jti);
  if (alreadyUsed) {
    return { ok: false, error: "Claim ticket has already been used" };
  }

  return { ok: true, payload };
}

/**
 * Atomically consume a claim ticket's JTI, preventing any future use.
 *
 * Call this ONLY after all side-effecting operations (on-chain calls, DB writes)
 * have completed successfully. If any prior step failed, do NOT call this —
 * leaving the JTI unconsumed allows the caller to retry with the same ticket.
 *
 * Returns true if the JTI was successfully consumed (this request owns it).
 * Returns false if the JTI was already consumed by a concurrent request.
 */
export async function consumeClaimTicketJti(payload: ClaimTicketPayload): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const remainingTtl = Math.max(1, payload.exp - now);
  return consumeJti(payload.jti, remainingTtl);
}

/**
 * Validate a claim ticket (verify + consume in one step).
 *
 * Use this ONLY for simple routes where ticket replay is inherently idempotent
 * and partial failures do not need retry semantics. For the /claim-nft atomic
 * route, use `verifyClaimTicket` + `consumeClaimTicketJti` instead.
 */
export async function validateClaimTicket(token: string, opts?: {
  wallet?: string;
  expectedAgentId?: string;
  expectedHandle?: string;
}): Promise<ClaimTicketValidationResult> {
  const result = await verifyClaimTicket(token, opts);
  if (!result.ok) return result;

  // Atomically consume JTI
  const now = Math.floor(Date.now() / 1000);
  const remainingTtl = Math.max(1, result.payload.exp - now);
  const consumed = await consumeJti(result.payload.jti, remainingTtl);
  if (!consumed) {
    return { ok: false, error: "Claim ticket has already been used" };
  }

  return result;
}

/**
 * Check if claim tickets can be issued (signing key is configured).
 */
export function isClaimTicketEnabled(): boolean {
  return !!signingKey();
}
