/**
 * Agent Authentication Middleware — Strategy-based authentication for agent-to-agent
 * and agent-to-platform interactions.
 *
 * ARCHITECTURE:
 * Authentication uses a strategy pattern. Each strategy implements the AgentAuthStrategy
 * interface and is registered at startup. The middleware iterates strategies in registration
 * order; the first strategy that returns an Agent wins.
 *
 * BUILT-IN STRATEGIES:
 * - "agent-key": Reads `X-Agent-Key` header, hashes the value with SHA-256, and looks up
 *   the matching row in api_keys where ownerType='agent' and revokedAt IS NULL.
 * - "pop-jwt": Reads `Authorization: Bearer <jwt>` header, verifies it is a PoP JWT
 *   signed by the agent's registered Ed25519 key (kid lookup in agent_keys), checks
 *   audience and expiry, and verifies replay protection via auth_nonces table.
 *   PoP JWT FLOW: Agent calls POST /v1/auth/challenge to obtain a nonce, uses that
 *   nonce as the JWT `jti`, self-signs the JWT with its Ed25519 key, and presents it
 *   as Authorization: Bearer. The nonce is consumed atomically (WHERE consumedAt IS NULL
 *   AND expiresAt > now()) ensuring one-time use with strict replay prevention.
 * - "session-jwt": Reads `Authorization: Bearer <jwt>` header where the JWT was issued
 *   by our auth-time challenge/response flow. Validates against agentid_sessions.
 *
 * EXTENSION POINTS — how to add future auth schemes:
 * 1. Implement AgentAuthStrategy with a unique `name` and an `authenticate(req)` method.
 * 2. Call `registerAgentAuthStrategy(yourStrategy)` at startup.
 *
 * AGENT STATUS GATE (enforced universally):
 * - "revoked", "draft", "inactive", "suspended" agents are ALWAYS rejected at every auth path.
 * - "pending_verification" agents are rejected except at verification-exempt endpoints.
 * - "active" + verificationStatus="verified" is required for protected routes.
 *
 * TRUST CONTEXT:
 * After authentication, req.agentTrustContext is populated with trust_tier,
 * verification_status, and owner_type. Downstream middleware can read this without
 * querying the database.
 */
import type { Request, Response, NextFunction } from "express";
import { createHash, verify as cryptoVerify, createPublicKey } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  apiKeysTable,
  agentsTable,
  agentKeysTable,
  agentidSessionsTable,
  type Agent,
} from "@workspace/db/schema";
import { logger } from "./request-logger";

declare global {
  namespace Express {
    interface Request {
      authenticatedAgent?: Agent;
      agentAuthStrategy?: string;
      agentTrustContext?: {
        trustTier: string;
        verificationStatus: string;
        ownerType: string;
        unclaimed: boolean;
        scopes: string[];
      };
      agentScopes?: string[];
    }
  }
}

/**
 * Interface for pluggable agent authentication strategies.
 * Implement this to add new auth mechanisms (HTTP signatures, DPoP, etc.).
 */
export interface AgentAuthStrategy {
  /** Unique identifier for this strategy (e.g. "agent-key", "pop-jwt"). */
  name: string;
  /** Extract credentials from the request and return the authenticated Agent, or null if
   *  this strategy does not apply to the request. */
  authenticate(req: Request): Promise<{ agent: Agent; scopes?: string[] } | null>;
}

const strategyRegistry: AgentAuthStrategy[] = [];

/**
 * Register an authentication strategy. Strategies are tried in registration order.
 * If a strategy with the same name already exists, it is replaced.
 */
export function registerAgentAuthStrategy(strategy: AgentAuthStrategy): void {
  const existing = strategyRegistry.findIndex(s => s.name === strategy.name);
  if (existing >= 0) {
    strategyRegistry[existing] = strategy;
  } else {
    strategyRegistry.push(strategy);
  }
}

export function getRegisteredStrategies(): ReadonlyArray<AgentAuthStrategy> {
  return strategyRegistry;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function verifyEdDsaJwt(token: string): Promise<Record<string, unknown> | null> {
  try {
    const jose = await import("jose");
    const { getSigningKeyPair } = await import("../services/verifiable-credential");
    const { publicKey } = await getSigningKeyPair();
    const { payload } = await jose.jwtVerify(token, publicKey, { algorithms: ["EdDSA"] });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function verifyEd25519Signature(message: string, signatureB64url: string, publicKeyB64: string): boolean {
  try {
    const sigBuffer = Buffer.from(signatureB64url, "base64url");
    const msgBuffer = Buffer.from(message, "utf8");
    const pubKeyDer = Buffer.from(publicKeyB64, "base64");
    const pubKey = createPublicKey({ key: pubKeyDer, format: "der", type: "spki" });
    return cryptoVerify(null, msgBuffer, pubKey, sigBuffer);
  } catch {
    return false;
  }
}

function determineOwnerType(agent: Agent): string {
  if (agent.orgId) return "org";
  if (agent.ownerUserId) return "user";
  if (agent.isClaimed) return "self";
  return "none";
}

function buildTrustContext(agent: Agent, scopes: string[] = []): NonNullable<Request["agentTrustContext"]> {
  const ownerType = determineOwnerType(agent);
  return {
    trustTier: agent.trustTier,
    verificationStatus: agent.verificationStatus,
    ownerType,
    unclaimed: ownerType === "none",
    scopes,
  };
}

const agentKeyStrategy: AgentAuthStrategy = {
  name: "agent-key",
  async authenticate(req: Request) {
    const apiKey = (req.headers["x-agent-key"] ?? req.headers["x-api-key"]) as string | undefined;
    if (!apiKey) return null;

    const hashed = hashKey(apiKey);

    const keyRecord = await db.query.apiKeysTable.findFirst({
      where: and(
        eq(apiKeysTable.hashedKey, hashed),
        eq(apiKeysTable.ownerType, "agent"),
        isNull(apiKeysTable.revokedAt),
      ),
    });

    if (!keyRecord) return null;

    await db
      .update(apiKeysTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeysTable.id, keyRecord.id));

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, keyRecord.ownerId),
    });

    if (!agent) return null;

    const scopes = (keyRecord.scopes as string[] | null) || [];
    return { agent, scopes };
  },
};

const sessionJwtStrategy: AgentAuthStrategy = {
  name: "session-jwt",
  async authenticate(req: Request) {
    const authHeader = req.headers["authorization"] as string | undefined;
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.slice(7);
    if (!token || token.startsWith("aid_") || token.startsWith("agk_")) return null;

    const claims = await verifyEdDsaJwt(token);
    if (!claims) return null;

    const jti = claims.jti as string | undefined;
    const agentId = claims.agent_id as string | undefined;
    if (!jti || !agentId) return null;

    const session = await db.query.agentidSessionsTable.findFirst({
      where: eq(agentidSessionsTable.sessionId, jti),
    });

    if (!session || session.revoked) return null;
    if (new Date() > session.expiresAt) return null;

    if (session.agentId !== agentId) return null;

    const sessionAud = session.audience;
    if (sessionAud) {
      const tokenAud = claims.aud as string | string[] | undefined;
      const tokenAudList = Array.isArray(tokenAud) ? tokenAud : tokenAud ? [tokenAud] : [];
      if (!tokenAudList.includes(sessionAud)) return null;
    }

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });

    if (!agent) return null;

    const scopes = (session.scopes as string[] | null) || [];
    return { agent, scopes };
  },
};

const popJwtStrategy: AgentAuthStrategy = {
  name: "pop-jwt",
  async authenticate(req: Request) {
    const authHeader = req.headers["authorization"] as string | undefined;
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.slice(7);
    if (!token || token.startsWith("aid_") || token.startsWith("agk_")) return null;

    let parts: string[];
    try {
      parts = token.split(".");
      if (parts.length !== 3) return null;
    } catch {
      return null;
    }

    let header: Record<string, unknown>;
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch {
      return null;
    }

    if (header.alg !== "EdDSA" && header.alg !== "Ed25519") return null;

    if (!claims.exp || typeof claims.exp !== "number" || Date.now() / 1000 > claims.exp) return null;

    const agentId = claims.agent_id as string | undefined;
    const kid = header.kid as string | undefined;
    const jti = claims.jti as string | undefined;
    if (!agentId || !kid) return null;
    if (!jti) return null;

    const aud = claims.aud as string | string[] | undefined;
    if (!aud) return null;
    const expectedAud = process.env.APP_URL || "https://getagent.id";
    const audList = Array.isArray(aud) ? aud : [aud];
    if (!audList.includes(expectedAud) && !audList.includes("agentid")) {
      return null;
    }

    const agentKey = await db.query.agentKeysTable.findFirst({
      where: and(
        eq(agentKeysTable.agentId, agentId),
        eq(agentKeysTable.kid, kid),
        eq(agentKeysTable.status, "active"),
      ),
    });

    if (!agentKey || !agentKey.publicKey) return null;

    const messageToVerify = `${parts[0]}.${parts[1]}`;
    const valid = verifyEd25519Signature(messageToVerify, parts[2], agentKey.publicKey);
    if (!valid) return null;

    {
      const { authNoncesTable } = await import("@workspace/db/schema");
      const { isNull, gt } = await import("drizzle-orm");
      const now = new Date();

      const updateResult = await db.update(authNoncesTable)
        .set({ consumedAt: now })
        .where(and(
          eq(authNoncesTable.nonce, jti),
          eq(authNoncesTable.agentId, agentId),
          isNull(authNoncesTable.consumedAt),
          gt(authNoncesTable.expiresAt, now),
        ))
        .returning();

      if (!updateResult.length) {
        return null;
      }

      const consumedNonce = updateResult[0];
      if (consumedNonce.audience) {
        const tokenAudList = Array.isArray(aud) ? aud : [aud as string];
        if (!tokenAudList.includes(consumedNonce.audience)) {
          return null;
        }
      }
    }

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });

    if (!agent) return null;

    const scopes = Array.isArray(claims.scope)
      ? (claims.scope as string[])
      : typeof claims.scope === "string"
        ? (claims.scope as string).split(" ").filter(Boolean)
        : [];

    return { agent, scopes };
  },
};

registerAgentAuthStrategy(agentKeyStrategy);
registerAgentAuthStrategy(sessionJwtStrategy);
registerAgentAuthStrategy(popJwtStrategy);

const VERIFICATION_EXEMPT_PATHS = [
  /\/verify\/initiate$/,
  /\/verify\/complete$/,
];

const INELIGIBLE_STATUSES = ["revoked", "draft", "inactive", "suspended"] as const;

function isAgentEligible(agent: Agent): { eligible: boolean; reason?: string } {
  if (INELIGIBLE_STATUSES.includes(agent.status as typeof INELIGIBLE_STATUSES[number])) {
    return { eligible: false, reason: `Agent status '${agent.status}' is not eligible for authentication` };
  }
  return { eligible: true };
}

export function tryAgentAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const hasAgentKey = !!req.headers["x-agent-key"];
  const hasBearer = req.headers["authorization"]?.toString().startsWith("Bearer ");
  if (!hasAgentKey && !hasBearer) {
    return next();
  }
  (async () => {
    for (const strategy of strategyRegistry) {
      try {
        const result = await strategy.authenticate(req);
        if (result) {
          const { agent, scopes = [] } = result;
          const { eligible } = isAgentEligible(agent);
          if (eligible && agent.verificationStatus === "verified") {
            req.authenticatedAgent = agent;
            req.agentAuthStrategy = strategy.name;
            req.agentTrustContext = buildTrustContext(agent, scopes);
            req.agentScopes = scopes;
          }
          break;
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message, strategy: strategy.name }, "[agent-auth] Strategy error during tryAgentAuth");
      }
    }
    next();
  })().catch(next);
}

export function requireAgentAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  (async () => {
    for (const strategy of strategyRegistry) {
      try {
        const result = await strategy.authenticate(req);
        if (result) {
          const { agent, scopes = [] } = result;

          const { eligible, reason } = isAgentEligible(agent);
          if (!eligible) {
            res.status(403).json({
              error: "Agent is not eligible for authentication",
              code: "AGENT_INELIGIBLE",
              reason,
              status: agent.status,
            });
            return;
          }

          const isExempt = VERIFICATION_EXEMPT_PATHS.some(p => p.test(req.path));
          if (!isExempt && agent.verificationStatus !== "verified") {
            res.status(403).json({
              error: "Agent must complete verification before it can be used",
              code: "AGENT_NOT_VERIFIED",
              verificationStatus: agent.verificationStatus,
            });
            return;
          }

          req.authenticatedAgent = agent;
          req.agentAuthStrategy = strategy.name;
          req.agentTrustContext = buildTrustContext(agent, scopes);
          req.agentScopes = scopes;
          next();
          return;
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message, strategy: strategy.name }, "[agent-auth] Strategy error during requireAgentAuth");
      }
    }

    res.status(401).json({
      error: "Agent authentication required",
      code: "AGENT_UNAUTHORIZED",
      supportedStrategies: strategyRegistry.map(s => s.name),
      hint: "Provide X-Agent-Key header, Authorization: Bearer <session-jwt>, or Authorization: Bearer <pop-jwt>",
      docsUrl: "https://getagent.id/api/llms.txt",
    });
  })().catch(next);
}

/**
 * Scope enforcement middleware factory.
 * Use: router.get('/protected', requireAgentAuth, requireScope('read:agents'), handler)
 */
export function requireScope(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authenticatedAgent) {
      res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
      return;
    }

    if (requiredScopes.length === 0) {
      next();
      return;
    }

    const grantedScopes = req.agentScopes || [];

    const hasAll = requiredScopes.every(s => grantedScopes.includes(s));
    if (!hasAll) {
      res.status(403).json({
        error: "Insufficient scopes",
        code: "INSUFFICIENT_SCOPE",
        required: requiredScopes,
        granted: grantedScopes,
      });
      return;
    }

    next();
  };
}
