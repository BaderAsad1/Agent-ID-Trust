/**
 * OAuth 2.0 Authorization Server service.
 *
 * Supports:
 * - Authorization code flow with PKCE (RFC 7636)
 * - Server-to-server signed assertion grant type (urn:agentid:grant-type:signed-assertion)
 * - Token revocation (RFC 7009)
 * - Trust context in all token payloads
 */
import { randomBytes, createHash, verify as cryptoVerify, createPublicKey } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentKeysTable,
  oauthClientsTable,
  oauthAuthorizationCodesTable,
  oauthTokensTable,
  auditEventsTable,
  agentOrganizationsTable,
  orgAgentsTable,
} from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { env } from "../lib/env";
import { formatDID } from "../utils/handle";
import { writeAuditEvent } from "./auth-session";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function getSigningKeyPair() {
  const { getSigningKeyPair } = await import("./verifiable-credential");
  return getSigningKeyPair();
}

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const jose = await import("jose");
  const { kid, _signer } = await getSigningKeyPair();
  const { iss, sub, aud, iat, exp, jti, ...rest } = payload as Record<string, unknown>;
  const builder = new jose.SignJWT(rest)
    .setProtectedHeader({ alg: "EdDSA", kid: kid as string, typ: "JWT" })
    .setIssuer(iss as string)
    .setSubject(sub as string)
    .setAudience(aud as string | string[])
    .setIssuedAt(iat as number | undefined)
    .setExpirationTime(exp as number)
    .setJti(jti as string);
  return _signer.sign(builder);
}

async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  try {
    const jose = await import("jose");
    const { publicKey, kid: currentKid } = await getSigningKeyPair();

    const header = jose.decodeProtectedHeader(token);
    const tokenKid = header.kid as string | undefined;

    if (tokenKid && tokenKid !== currentKid) {
      return null;
    }

    const { payload } = await jose.jwtVerify(token, publicKey, { algorithms: ["EdDSA"] });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function verifyEd25519Signature(message: string, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const sigBuffer = Buffer.from(signatureB64, "base64");
    const msgBuffer = Buffer.from(message, "utf8");
    const pubKeyDer = Buffer.from(publicKeyB64, "base64");
    const pubKey = createPublicKey({ key: pubKeyDer, format: "der", type: "spki" });
    return cryptoVerify(null, msgBuffer, pubKey, sigBuffer);
  } catch {
    return false;
  }
}

async function buildTrustContext(agent: typeof agentsTable.$inferSelect): Promise<Record<string, unknown>> {
  const ownerType = agent.orgId ? "org" : agent.ownerUserId ? "user" : agent.isClaimed ? "self" : "none";
  let orgInfo: { orgId?: string; orgName?: string } = {};

  if (agent.orgId) {
    const org = await db.query.agentOrganizationsTable.findFirst({
      where: eq(agentOrganizationsTable.id, agent.orgId),
    });
    if (org) {
      orgInfo = { orgId: org.id, orgName: org.displayName };
    }
  }

  return {
    trust_tier: agent.trustTier,
    verification_status: agent.verificationStatus,
    owner_type: ownerType,
    unclaimed: ownerType === "none",
    ...orgInfo,
    capabilities: agent.capabilities || [],
  };
}

function buildAccessTokenPayload(
  agent: typeof agentsTable.$inferSelect,
  clientId: string | null | undefined,
  scopes: string[],
  tokenId: string,
  trustContext: Record<string, unknown>,
  sessionType: "delegated" | "autonomous" = "delegated",
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 900; // 15 min
  const handle = agent.handle ?? agent.id;
  const did = formatDID(handle);

  return {
    iss: env().APP_URL || "https://getagent.id",
    sub: did,
    aud: clientId || "agentid",
    iat: now,
    exp,
    jti: tokenId,
    agent_id: agent.id,
    handle: agent.handle ?? null,
    trust_tier: agent.trustTier,
    verification_status: agent.verificationStatus,
    agent_state: agent.status,
    claim_state: agent.isClaimed ? "claimed" : "unclaimed",
    owner_type: trustContext.owner_type,
    owner_backed: !!(agent.ownerUserId || agent.orgId),
    scope: scopes.join(" "),
    session_type: sessionType,
    trust_context: trustContext,
  };
}

export async function createAuthorizationCode(
  clientId: string,
  agentId: string,
  redirectUri: string,
  scopes: string[],
  codeChallenge?: string,
  codeChallengeMethod?: string,
): Promise<string> {
  const code = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);

  await db.insert(oauthAuthorizationCodesTable).values({
    code,
    clientId,
    agentId,
    redirectUri,
    scopes,
    codeChallenge,
    codeChallengeMethod,
    expiresAt,
  });

  return code;
}

export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string | undefined,
  codeVerifier: string | undefined,
): Promise<{ access_token: string; refresh_token: string; expires_in: number; token_type: string }> {
  const authCode = await db.query.oauthAuthorizationCodesTable.findFirst({
    where: and(
      eq(oauthAuthorizationCodesTable.code, code),
      eq(oauthAuthorizationCodesTable.clientId, clientId),
      isNull(oauthAuthorizationCodesTable.usedAt),
    ),
  });

  if (!authCode) throw new Error("invalid_grant: Authorization code not found or already used");
  if (new Date() > authCode.expiresAt) throw new Error("invalid_grant: Authorization code expired");

  if (authCode.redirectUri) {
    if (!redirectUri || authCode.redirectUri !== redirectUri) {
      throw new Error("invalid_grant: redirect_uri must exactly match the URI used when the authorization code was issued");
    }
  } else if (redirectUri) {
    throw new Error("invalid_grant: redirect_uri was not used at authorization time and must not be provided at exchange");
  }

  if (authCode.codeChallenge) {
    if (!codeVerifier) throw new Error("invalid_grant: code_verifier required");
    const method = authCode.codeChallengeMethod || "S256";
    let computedChallenge: string;
    if (method === "S256") {
      computedChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    } else {
      computedChallenge = codeVerifier;
    }
    if (computedChallenge !== authCode.codeChallenge) {
      throw new Error("invalid_grant: PKCE verification failed");
    }
  }

  await db
    .update(oauthAuthorizationCodesTable)
    .set({ usedAt: new Date() })
    .where(eq(oauthAuthorizationCodesTable.id, authCode.id));

  return issueTokenPair(authCode.agentId, clientId, authCode.scopes, "authorization_code");
}

export async function signedAssertionGrant(
  agentId: string,
  clientId: string,
  scopes: string[],
  assertionJwt: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number; token_type: string }> {
  const parts = assertionJwt.split(".");
  if (parts.length !== 3) throw new Error("invalid_grant: malformed assertion JWT");

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid_grant: invalid assertion JWT header or claims");
  }

  const kid = header.kid as string | undefined;
  if (!kid) throw new Error("invalid_grant: assertion header missing kid");

  const alg = header.alg as string | undefined;
  if (alg !== "EdDSA" && alg !== "Ed25519") throw new Error("invalid_grant: assertion alg must be EdDSA");

  if (!claims.jti || typeof claims.jti !== "string") throw new Error("invalid_grant: assertion missing jti");
  if (!claims.exp || typeof claims.exp !== "number") throw new Error("invalid_grant: assertion missing exp");
  if (!claims.iat || typeof claims.iat !== "number") throw new Error("invalid_grant: assertion missing iat");
  if (Date.now() / 1000 > claims.exp) throw new Error("invalid_grant: assertion expired");

  const clockSkewSeconds = 300;
  if (Date.now() / 1000 < (claims.iat as number) - clockSkewSeconds) throw new Error("invalid_grant: assertion iat in the future");

  const expectedIssuer = `did:web:getagent.id:agents:${agentId}`;
  if (claims.iss !== expectedIssuer && claims.iss !== agentId) {
    throw new Error("invalid_grant: assertion issuer mismatch");
  }

  const { env: getEnv } = await import("../lib/env");
  const expectedAud = getEnv().APP_URL || "https://getagent.id";
  const audList = Array.isArray(claims.aud) ? claims.aud as string[] : claims.aud ? [claims.aud as string] : [];
  if (!audList.includes(expectedAud) && !audList.includes("agentid")) {
    throw new Error("invalid_grant: assertion audience mismatch");
  }

  const agentKey = await db.query.agentKeysTable.findFirst({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.kid, kid),
      eq(agentKeysTable.status, "active"),
    ),
  });

  if (!agentKey || !agentKey.publicKey) throw new Error("invalid_client: No active key found for agent with kid " + kid);

  const messageToVerify = `${parts[0]}.${parts[1]}`;
  const sig = parts[2];
  const valid = verifyEd25519Signature(messageToVerify, sig, agentKey.publicKey);
  if (!valid) throw new Error("invalid_grant: assertion signature invalid");

  const { authNoncesTable } = await import("@workspace/db/schema");
  const { isNull, gt } = await import("drizzle-orm");
  const now = new Date();
  const consumed = await db.update(authNoncesTable)
    .set({ consumedAt: now })
    .where(and(
      eq(authNoncesTable.nonce, claims.jti as string),
      eq(authNoncesTable.agentId, agentId),
      isNull(authNoncesTable.consumedAt),
      gt(authNoncesTable.expiresAt, now),
    ))
    .returning();

  if (!consumed.length) {
    throw new Error("invalid_grant: assertion jti already used, expired, or not bound to this agent");
  }

  const consumedNonce = consumed[0];
  if (consumedNonce.audience) {
    const audList = Array.isArray(claims.aud) ? claims.aud as string[] : claims.aud ? [claims.aud as string] : [];
    if (!audList.includes(consumedNonce.audience)) {
      throw new Error("invalid_grant: assertion audience does not match the audience for which this nonce was issued");
    }
  }

  await writeAuditEvent("agent", agentId, "auth.assertion.granted", "client", clientId, {
    grantType: "signed_assertion",
    kid: agentKey.kid,
    signal: "assertion_token_issued",
  });

  return issueTokenPair(agentId, clientId, scopes, "urn:agentid:grant-type:signed-assertion");
}

export async function issueTokenPair(
  agentId: string,
  clientId: string | null,
  scopes: string[],
  grantType: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number; token_type: string }> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });
  if (!agent) throw new Error("invalid_client: Agent not found");

  if (["revoked", "draft", "inactive", "suspended"].includes(agent.status)) {
    throw new Error(`invalid_client: Agent status '${agent.status}' is not eligible`);
  }

  const orgId = agent.orgId as string | null | undefined;
  if (orgId) {
    const { orgPoliciesTable, orgAgentsTable } = await import("@workspace/db/schema");

    const orgMembership = await db.query.orgAgentsTable.findFirst({
      where: and(
        eq(orgAgentsTable.orgId, orgId),
        eq(orgAgentsTable.agentId, agentId),
      ),
    });
    if (!orgMembership) {
      throw new Error("invalid_client: Agent is not a current member of the associated org");
    }

    const policies = await db.query.orgPoliciesTable.findMany({
      where: eq(orgPoliciesTable.orgId, orgId),
    });

    for (const policy of policies) {
      const config = policy.config as Record<string, unknown>;
      const tierOrder: Record<string, number> = {
        unverified: 1,
        basic: 2,
        verified: 3,
        trusted: 4,
        elite: 5,
      };

      switch (policy.policyType) {
        case "required_trust_tier": {
          const requiredTier = config.tier as string | undefined;
          const agentTierVal = tierOrder[agent.trustTier || "unverified"] ?? 0;
          const requiredTierVal = tierOrder[requiredTier || "unverified"] ?? 0;
          if (agentTierVal < requiredTierVal) {
            throw new Error(`policy_violation: Agent trust tier '${agent.trustTier}' below org minimum required '${requiredTier}'`);
          }
          break;
        }
        case "max_trust_tier_required": {
          const maxTier = config.max_tier as string | undefined;
          const agentTierVal = tierOrder[agent.trustTier || "unverified"] ?? 0;
          const maxTierVal = tierOrder[maxTier || "elite"] ?? tierOrder.elite;
          if (agentTierVal > maxTierVal) {
            throw new Error(`policy_violation: Agent trust tier '${agent.trustTier}' exceeds org maximum allowed '${maxTier}'`);
          }
          break;
        }
        case "required_scopes": {
          const blockedScopes = config.blocked as string[] | undefined;
          if (blockedScopes && scopes.some((s) => blockedScopes.includes(s))) {
            const blocked = scopes.filter((s) => blockedScopes.includes(s));
            throw new Error(`policy_violation: Scope(s) [${blocked.join(", ")}] are blocked by org policy`);
          }
          break;
        }
        case "verified_only": {
          if (config.enforced === true && agent.verificationStatus !== "verified") {
            throw new Error(`policy_violation: Org requires verified agents only`);
          }
          break;
        }
        case "restrict_unclaimed_agents": {
          if (config.enforced === true && !agent.isClaimed) {
            throw new Error(`policy_violation: Org does not permit unclaimed agents`);
          }
          break;
        }
        case "require_owner_for_scope": {
          const protectedScopes = config.scopes as string[] | undefined;
          if (protectedScopes && !agent.isClaimed) {
            const blocked = scopes.filter((s: string) => protectedScopes.includes(s));
            if (blocked.length > 0) {
              throw new Error(`policy_violation: Scope(s) [${blocked.join(", ")}] require an owned (claimed) agent`);
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }

  const trustContext = await buildTrustContext(agent);
  const tokenId = randomBytes(24).toString("hex");
  const sessionType = grantType === "urn:agentid:grant-type:signed-assertion" ? "autonomous" : "delegated";
  const accessToken = await signJwt(buildAccessTokenPayload(agent, clientId, scopes, tokenId, trustContext, sessionType));
  const refreshToken = randomBytes(40).toString("hex");
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await db.insert(oauthTokensTable).values({
    tokenId,
    agentId,
    clientId: clientId || undefined,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    scopes,
    trustTier: agent.trustTier,
    verificationStatus: agent.verificationStatus,
    ownerType: (trustContext.owner_type as string) || "none",
    grantType,
    issuedAt: new Date(),
    expiresAt: accessExpiresAt,
    refreshExpiresAt,
  });

  await writeAuditEvent("agent", agentId, "auth.token.issued", "client", clientId || "agentid", {
    tokenId,
    grantType,
    scopes,
    trustTier: agent.trustTier,
    signal: "token_issued",
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    token_type: "Bearer",
  };
}

export async function revokeOAuthToken(
  token: string,
  tokenTypeHint?: string,
  callerClientId?: string | null,
): Promise<void> {
  const hash = hashToken(token);

  const byAccess = await db.query.oauthTokensTable.findFirst({
    where: eq(oauthTokensTable.accessTokenHash, hash),
  });
  if (byAccess) {
    if (callerClientId && byAccess.clientId && byAccess.clientId !== callerClientId) {
      throw new Error("invalid_grant: token does not belong to this client");
    }
    await db.update(oauthTokensTable)
      .set({ revokedAt: new Date(), revokedReason: "revoked_by_client" })
      .where(eq(oauthTokensTable.id, byAccess.id));

    await writeAuditEvent("system", byAccess.agentId, "auth.token.revoked", "token", byAccess.tokenId, {
      tokenId: byAccess.tokenId,
      signal: "token_revoked",
    });
    return;
  }

  const byRefresh = await db.query.oauthTokensTable.findFirst({
    where: eq(oauthTokensTable.refreshTokenHash, hash),
  });
  if (byRefresh) {
    if (callerClientId && byRefresh.clientId && byRefresh.clientId !== callerClientId) {
      throw new Error("invalid_grant: token does not belong to this client");
    }
    await db.update(oauthTokensTable)
      .set({ revokedAt: new Date(), revokedReason: "revoked_by_client" })
      .where(eq(oauthTokensTable.id, byRefresh.id));

    await writeAuditEvent("system", byRefresh.agentId, "auth.token.revoked", "token", byRefresh.tokenId, {
      tokenId: byRefresh.tokenId,
      signal: "token_revoked",
    });
  }
}

export async function introspectOAuthToken(token: string): Promise<{
  active: boolean;
  sub?: string;
  client_id?: string | null;
  scope?: string;
  exp?: number;
  iat?: number;
  trust_tier?: string;
  verification_status?: string;
  owner_type?: string;
  token_id?: string;
  trust_context?: Record<string, unknown>;
}> {
  const hash = hashToken(token);
  const tokenRecord = await db.query.oauthTokensTable.findFirst({
    where: eq(oauthTokensTable.accessTokenHash, hash),
  });

  if (!tokenRecord || tokenRecord.revokedAt) return { active: false };
  if (new Date() > tokenRecord.expiresAt) return { active: false };

  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, tokenRecord.agentId),
  });
  if (!agent || agent.status === "revoked") return { active: false };

  const handle = agent.handle ?? agent.id;
  const did = formatDID(handle);
  const trustContext = await buildTrustContext(agent);

  await writeAuditEvent("system", tokenRecord.agentId, "auth.introspect", "token", tokenRecord.tokenId, {
    tokenId: tokenRecord.tokenId,
    signal: "introspection",
  });

  return {
    active: true,
    sub: did,
    client_id: tokenRecord.clientId,
    scope: tokenRecord.scopes?.join(" ") ?? "",
    exp: Math.floor(tokenRecord.expiresAt.getTime() / 1000),
    iat: Math.floor(tokenRecord.issuedAt.getTime() / 1000),
    trust_tier: tokenRecord.trustTier || agent.trustTier,
    verification_status: tokenRecord.verificationStatus || agent.verificationStatus,
    owner_type: tokenRecord.ownerType ?? undefined,
    token_id: tokenRecord.tokenId,
    trust_context: trustContext,
  };
}

export { signJwt, verifyJwt, hashToken };
