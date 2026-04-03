/**
 * Auth Session Service — Challenge/response authentication producing short-lived session JWTs.
 *
 * Flow:
 * 1. Agent calls POST /v1/auth/challenge to get a nonce bound to an audience
 * 2. Agent signs the challenge with its Ed25519 key
 * 3. Agent calls POST /v1/auth/session with the signed challenge
 * 4. Server verifies signature, issues a 15-minute session JWT, stores in agentid_sessions
 *
 * The session JWT is signed with EdDSA (Ed25519) using the VC signing key pair so it is
 * verifiable offline via the JWKS endpoint (/.well-known/jwks.json).
 *
 * Claims: sub (agent DID), trust_tier, verification_status, owner_type, scopes,
 *         iss, aud, exp, iat, jti (session_id), kid (header).
 */
import { randomBytes, verify as cryptoVerify, createPublicKey, createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentKeysTable,
  authNoncesTable,
  agentidSessionsTable,
  auditEventsTable,
  oauthTokensTable,
} from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { env } from "../lib/env";

const SESSION_TTL_MS = 15 * 60 * 1000;
const NONCE_TTL_MS = 5 * 60 * 1000;

const INELIGIBLE_STATUSES = ["revoked", "draft", "inactive", "suspended"] as const;

function isStatusIneligible(status: string): boolean {
  return INELIGIBLE_STATUSES.includes(status as typeof INELIGIBLE_STATUSES[number]);
}

async function getJose() {
  return import("jose");
}

async function getSigningKeyPair() {
  const { getSigningKeyPair } = await import("./verifiable-credential");
  return getSigningKeyPair();
}

export async function createAuthChallenge(agentId: string, audience?: string): Promise<{
  nonce: string;
  expiresAt: Date;
  agentId: string;
  audience: string | null;
}> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });

  if (!agent) throw new Error("Agent not found");

  if (isStatusIneligible(agent.status)) {
    throw new Error(`Agent status ${agent.status} is not eligible for authentication`);
  }

  const nonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  await db.insert(authNoncesTable).values({
    nonce,
    agentId,
    audience: audience || null,
    expiresAt,
  });

  return { nonce, expiresAt, agentId, audience: audience || null };
}

export async function verifyAndIssueSession(
  agentId: string,
  nonce: string,
  signature: string,
  kid: string,
  ipAddress?: string,
  userAgent?: string,
  requestedScopes?: string[],
): Promise<{ sessionToken: string; expiresAt: Date; sessionId: string; scopes: string[] }> {
  const nonceRecord = await db.query.authNoncesTable.findFirst({
    where: and(
      eq(authNoncesTable.nonce, nonce),
      eq(authNoncesTable.agentId, agentId),
      isNull(authNoncesTable.consumedAt),
    ),
  });

  if (!nonceRecord) {
    await writeAuditEvent("agent", agentId, "auth.failure", "agent", agentId, {
      reason: "nonce_not_found",
      kid,
    }, ipAddress, userAgent);
    throw new Error("Invalid or already consumed nonce");
  }

  if (new Date() > nonceRecord.expiresAt) {
    await writeAuditEvent("agent", agentId, "auth.failure", "agent", agentId, {
      reason: "nonce_expired",
      kid,
    }, ipAddress, userAgent);
    throw new Error("Nonce has expired");
  }

  const agentKey = await db.query.agentKeysTable.findFirst({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.kid, kid),
      eq(agentKeysTable.status, "active"),
    ),
  });

  if (!agentKey || !agentKey.publicKey) {
    await writeAuditEvent("agent", agentId, "auth.failure", "agent", agentId, {
      reason: "key_not_found",
      kid,
    }, ipAddress, userAgent);
    throw new Error("No active key found with the provided kid");
  }

  const challengeMessage = nonceRecord.audience
    ? `${nonce}:${agentId}:${nonceRecord.audience}`
    : `${nonce}:${agentId}`;
  const valid = verifyEd25519Signature(challengeMessage, signature, agentKey.publicKey);
  if (!valid) {
    await writeAuditEvent("agent", agentId, "auth.failure", "agent", agentId, {
      reason: "invalid_signature",
      kid,
    }, ipAddress, userAgent);
    throw new Error("Signature verification failed");
  }

  const { gt } = await import("drizzle-orm");
  const consumeNow = new Date();
  const consumed = await db
    .update(authNoncesTable)
    .set({ consumedAt: consumeNow })
    .where(and(
      eq(authNoncesTable.id, nonceRecord.id),
      eq(authNoncesTable.agentId, agentId),
      isNull(authNoncesTable.consumedAt),
      gt(authNoncesTable.expiresAt, consumeNow),
    ))
    .returning();

  if (!consumed.length) {
    await writeAuditEvent("agent", agentId, "auth.failure", "agent", agentId, {
      reason: "nonce_already_consumed_race",
      kid,
    }, ipAddress, userAgent);
    throw new Error("Nonce was already consumed");
  }

  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });

  if (!agent) throw new Error("Agent not found");

  if (isStatusIneligible(agent.status)) {
    await writeAuditEvent("agent", agentId, "auth.failure", "agent", agentId, {
      reason: `agent_status_${agent.status}`,
    }, ipAddress, userAgent);
    throw new Error(`Agent status ${agent.status} does not permit authentication`);
  }

  const sessionId = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const did = `did:web:getagent.id:agents:${agent.id}`;
  const ownerType = determineOwnerType(agent);

  const grantedScopes = requestedScopes && requestedScopes.length > 0
    ? requestedScopes.filter(s => SESSION_DEFAULT_SCOPES.includes(s))
    : SESSION_DEFAULT_SCOPES;

  const [session] = await db.insert(agentidSessionsTable).values({
    sessionId,
    agentId,
    audience: nonceRecord.audience,
    scopes: grantedScopes,
    trustTier: agent.trustTier,
    verificationStatus: agent.verificationStatus,
    issuedAt: new Date(),
    expiresAt,
    revoked: false,
    ipAddress,
    userAgent,
  }).returning();

  const sessionToken = await buildSessionJwt({
    sessionId: session.sessionId,
    agentId,
    did,
    trustTier: agent.trustTier,
    verificationStatus: agent.verificationStatus,
    ownerType,
    audience: nonceRecord.audience,
    expiresAt,
    scopes: grantedScopes,
  });

  await writeAuditEvent("agent", agentId, "auth.session.created", "agent", agentId, {
    sessionId,
    trustTier: agent.trustTier,
    verificationStatus: agent.verificationStatus,
    kid,
    signal: "session_issued",
  }, ipAddress, userAgent);

  return { sessionToken, expiresAt, sessionId, scopes: grantedScopes };
}

export async function introspectToken(token: string): Promise<{
  active: boolean;
  sub?: string;
  trustTier?: string;
  verificationStatus?: string;
  ownerType?: string;
  scopes?: string[];
  exp?: number;
  iat?: number;
  sessionId?: string;
  trust_context?: {
    trust_tier: string;
    verification_status: string;
    owner_type: string;
    org_id?: string;
  };
}> {
  try {
    const payload = await verifySessionJwt(token);
    if (!payload) return { active: false };

    const session = await db.query.agentidSessionsTable.findFirst({
      where: eq(agentidSessionsTable.sessionId, payload.jti as string),
    });

    if (!session || session.revoked) return { active: false };
    if (new Date() > session.expiresAt) return { active: false };

    const trustTier = payload.trust_tier as string;
    const verificationStatus = payload.verification_status as string;
    const ownerType = payload.owner_type as string;
    const orgId = payload.org_id as string | undefined;

    return {
      active: true,
      sub: payload.sub as string,
      trustTier,
      verificationStatus,
      ownerType,
      scopes: (payload.scope as string || "").split(" ").filter(Boolean),
      exp: payload.exp as number,
      iat: payload.iat as number,
      sessionId: session.sessionId,
      trust_context: {
        trust_tier: trustTier,
        verification_status: verificationStatus,
        owner_type: ownerType,
        org_id: orgId,
      },
    };
  } catch {
    return { active: false };
  }
}

export async function revokeSession(sessionId: string, reason?: string, ownerAgentId?: string): Promise<boolean> {
  const session = await db.query.agentidSessionsTable.findFirst({
    where: eq(agentidSessionsTable.sessionId, sessionId),
  });

  if (!session) return false;
  if (ownerAgentId && session.agentId !== ownerAgentId) return false;

  await db
    .update(agentidSessionsTable)
    .set({ revoked: true, revokedAt: new Date(), revokedReason: reason })
    .where(eq(agentidSessionsTable.sessionId, sessionId));

  return true;
}

export async function hashToken(token: string): Promise<string> {
  return createHash("sha256").update(token).digest("hex");
}

function verifyEd25519Signature(message: string, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const sigBuffer = Buffer.from(signatureB64, "base64");
    const msgBuffer = Buffer.from(message, "utf8");

    const pubKeyDer = Buffer.from(publicKeyB64, "base64");
    const pubKey = createPublicKey({ key: pubKeyDer, format: "der", type: "spki" });

    return cryptoVerify(null, msgBuffer, pubKey, sigBuffer);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[auth-session] Signature verification error");
    return false;
  }
}

function determineOwnerType(agent: typeof agentsTable.$inferSelect): string {
  if (agent.orgId) return "org";
  if (agent.ownerUserId) return "user";
  if (agent.isClaimed) return "self";
  return "none";
}

const SESSION_DEFAULT_SCOPES = [
  "agents:read",
  "agents:write",
  "agents:spawn",
  "agents:attest",
  "agents:runtime",
  "wallet:read",
  "wallet:write",
];

interface SessionPayload {
  sessionId: string;
  agentId: string;
  did: string;
  trustTier: string;
  verificationStatus: string;
  ownerType: string;
  audience: string | null | undefined;
  expiresAt: Date;
  scopes: string[];
}

async function buildSessionJwt(payload: SessionPayload): Promise<string> {
  const jose = await getJose();
  const { kid, _signer } = await getSigningKeyPair();
  const issuer = env().APP_URL || "https://getagent.id";
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.floor(payload.expiresAt.getTime() / 1000);

  const builder = new jose.SignJWT({
    agent_id: payload.agentId,
    trust_tier: payload.trustTier,
    verification_status: payload.verificationStatus,
    owner_type: payload.ownerType,
    scope: payload.scopes.join(" "),
    trust_context: {
      trust_tier: payload.trustTier,
      verification_status: payload.verificationStatus,
      owner_type: payload.ownerType,
      unclaimed: payload.ownerType === "none",
    },
  })
    .setProtectedHeader({ alg: "EdDSA", kid, typ: "JWT" })
    .setIssuer(issuer)
    .setSubject(payload.did)
    .setAudience(payload.audience || "agentid")
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(payload.sessionId);

  return _signer.sign(builder);
}

async function verifySessionJwt(token: string): Promise<Record<string, unknown> | null> {
  try {
    const jose = await getJose();
    const { publicKey, kid: currentKid } = await getSigningKeyPair();

    const header = jose.decodeProtectedHeader(token);
    const tokenKid = header.kid as string | undefined;

    if (tokenKid && tokenKid !== currentKid) {
      logger.warn({ tokenKid, currentKid }, "[auth-session] Token kid mismatch — key may have been rotated; token invalid");
      return null;
    }

    const { payload } = await jose.jwtVerify(token, publicKey, {
      algorithms: ["EdDSA"],
    });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

function resolveActorId(actorType: string, actorId: string): string {
  if (actorType === "system") return SYSTEM_ACTOR_UUID;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (uuidRegex.test(actorId)) return actorId;
  return SYSTEM_ACTOR_UUID;
}

async function writeAuditEvent(
  actorType: string,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
  ip?: string,
  ua?: string,
): Promise<void> {
  try {
    const resolvedActorId = resolveActorId(actorType, actorId);
    await db.insert(auditEventsTable).values({
      actorType: actorType === "system" ? "system" : actorType,
      actorId: resolvedActorId,
      eventType: action,
      targetType: targetType || undefined,
      targetId: targetId || undefined,
      payload: {
        ...metadata,
        actorIdOriginal: actorId !== resolvedActorId ? actorId : undefined,
      },
      ipAddress: ip || undefined,
      userAgent: ua || undefined,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[auth-session] Failed to write audit event");
  }
}

export { buildSessionJwt as buildJwt, verifySessionJwt as verifyJwt, writeAuditEvent };
