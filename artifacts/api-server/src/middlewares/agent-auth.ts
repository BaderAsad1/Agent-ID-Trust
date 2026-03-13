/**
 * Agent Authentication Middleware — Strategy-based authentication for agent-to-agent
 * and agent-to-platform interactions.
 *
 * ARCHITECTURE:
 * Authentication uses a strategy pattern. Each strategy implements the AgentAuthStrategy
 * interface and is registered at startup. The middleware iterates strategies in registration
 * order; the first strategy that returns an Agent wins.
 *
 * BUILT-IN STRATEGY:
 * - "agent-key": Reads `X-Agent-Key` header, hashes the value with SHA-256, and looks up
 *   the matching row in api_keys where ownerType='agent' and revokedAt IS NULL.
 *
 * EXTENSION POINTS — how to add future auth schemes:
 * 1. Implement AgentAuthStrategy with a unique `name` and an `authenticate(req)` method.
 * 2. Call `registerAgentAuthStrategy(yourStrategy)` at startup (e.g. in server bootstrap).
 *    Example future strategies:
 *    - "http-signatures": Verify HTTP Message Signatures (RFC 9421) from the request headers.
 *    - "dpop": Validate DPoP proof-of-possession tokens bound to the agent's public key.
 *    - "proof-of-possession": Verify signed challenge-response JWTs.
 * 3. Strategies are tried in registration order. The first match short-circuits.
 *
 * VERIFICATION GATING:
 * After authentication, the middleware enforces that the agent has verificationStatus="verified".
 * Agents in pending_verification or other non-verified states are rejected with 403, except
 * for explicitly exempted paths (e.g. verification completion endpoints).
 */
import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { apiKeysTable, agentsTable, type Agent } from "@workspace/db/schema";

declare global {
  namespace Express {
    interface Request {
      authenticatedAgent?: Agent;
      agentAuthStrategy?: string;
    }
  }
}

/**
 * Interface for pluggable agent authentication strategies.
 * Implement this to add new auth mechanisms (HTTP signatures, DPoP, etc.).
 */
export interface AgentAuthStrategy {
  /** Unique identifier for this strategy (e.g. "agent-key", "http-signatures"). */
  name: string;
  /** Extract credentials from the request and return the authenticated Agent, or null if
   *  this strategy does not apply to the request. */
  authenticate(req: Request): Promise<Agent | null>;
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

const agentKeyStrategy: AgentAuthStrategy = {
  name: "agent-key",
  async authenticate(req: Request): Promise<Agent | null> {
    const apiKey = req.headers["x-agent-key"] as string | undefined;
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

    return agent ?? null;
  },
};

registerAgentAuthStrategy(agentKeyStrategy);

const VERIFICATION_EXEMPT_PATHS = [
  /\/verify\/initiate$/,
  /\/verify\/complete$/,
];

export function requireAgentAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  (async () => {
    for (const strategy of strategyRegistry) {
      const agent = await strategy.authenticate(req);
      if (agent) {
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
        next();
        return;
      }
    }

    res.status(401).json({
      error: "Agent authentication required",
      code: "AGENT_UNAUTHORIZED",
      supportedStrategies: strategyRegistry.map(s => s.name),
    });
  })().catch(next);
}
