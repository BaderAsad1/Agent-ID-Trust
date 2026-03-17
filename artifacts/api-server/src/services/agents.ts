import { eq, and, ilike } from "drizzle-orm";
import { logger } from "../middlewares/request-logger";
import { db } from "@workspace/db";
import { agentsTable, usersTable, type Agent } from "@workspace/db/schema";

export interface CreateAgentInput {
  userId: string;
  handle: string;
  displayName: string;
  description?: string;
  endpointUrl?: string;
  capabilities?: string[];
  scopes?: string[];
  protocols?: string[];
  authMethods?: string[];
  paymentMethods?: string[];
  isPublic?: boolean;
  metadata?: unknown;
}

export interface UpdateAgentInput {
  displayName?: string;
  description?: string;
  endpointUrl?: string;
  endpointSecret?: string;
  capabilities?: string[];
  scopes?: string[];
  protocols?: string[];
  authMethods?: string[];
  paymentMethods?: string[];
  isPublic?: boolean;
  status?: "draft" | "active" | "inactive";
  avatarUrl?: string;
  metadata?: unknown;
}

const HANDLE_RE = /^[a-z0-9][a-z0-9\-]{1,98}[a-z0-9]$/;

export function validateHandle(handle: string): string | null {
  if (!HANDLE_RE.test(handle)) {
    return "Handle must be 3-100 lowercase alphanumeric characters or hyphens, starting and ending with alphanumeric";
  }
  return null;
}

export const RESERVED_HANDLES = new Set([
  "openai",
  "anthropic",
  "google",
  "deepmind",
  "mistral",
  "meta",
  "microsoft",
  "apple",
  "amazon",
  "aws",
  "nvidia",
  "cohere",
  "stability",
  "stabilityai",
  "huggingface",
  "ollama",
  "groq",
  "perplexity",
  "inflection",
  "adept",
  "writer",
  "aleph",
  "imbue",
  "mosaic",
  "together",
  "replicate",
  "anyscale",
  "databricks",
  "salesforce",
  "gpt",
  "gpt4",
  "gpt3",
  "gpt-4",
  "gpt-3",
  "claude",
  "claude3",
  "gemini",
  "llama",
  "llama2",
  "llama3",
  "falcon",
  "mistralai",
  "mixtral",
  "palm",
  "palm2",
  "bard",
  "copilot",
  "chatgpt",
  "grok",
  "xai",
  "langchain",
  "llamaindex",
  "autogpt",
  "babyagi",
  "crewai",
  "agentops",
  "agentprotocol",
  "a2a",
  "mcp",
  "openrouter",
  "together-ai",
  "admin",
  "administrator",
  "support",
  "help",
  "official",
  "system",
  "root",
  "api",
  "bot",
  "getagent",
  "agentid",
  "platform",
  "staff",
  "moderator",
  "security",
  "trust",
]);

export function isHandleReserved(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.toLowerCase());
}

const handleCache = new Map<string, { available: boolean; expiresAt: number }>();
const HANDLE_CACHE_TTL_MS = 60_000;

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const cacheKey = handle.toLowerCase();
  const cached = handleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.available;
  }

  const existing = await db.query.agentsTable.findFirst({
    where: ilike(agentsTable.handle, handle),
    columns: { id: true },
  });
  const available = !existing;

  handleCache.set(cacheKey, { available, expiresAt: Date.now() + HANDLE_CACHE_TTL_MS });

  if (handleCache.size > 10_000) {
    const now = Date.now();
    for (const [key, entry] of handleCache) {
      if (entry.expiresAt <= now) handleCache.delete(key);
    }
  }

  return available;
}

export function invalidateHandleCache(handle: string): void {
  handleCache.delete(handle.toLowerCase());
}

export async function getHandleReservation(handle: string): Promise<{ isReserved: boolean; reservedReason: string | null }> {
  const existing = await db.query.agentsTable.findFirst({
    where: and(ilike(agentsTable.handle, handle), eq(agentsTable.isReserved, true)),
    columns: { isReserved: true, reservedReason: true },
  });
  if (existing) {
    return { isReserved: true, reservedReason: existing.reservedReason };
  }
  return { isReserved: false, reservedReason: null };
}

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const result = await db
    .insert(agentsTable)
    .values({
      userId: input.userId,
      handle: input.handle.toLowerCase(),
      displayName: input.displayName,
      description: input.description,
      endpointUrl: input.endpointUrl,
      capabilities: input.capabilities || [],
      scopes: input.scopes || [],
      protocols: input.protocols || [],
      authMethods: input.authMethods || [],
      paymentMethods: input.paymentMethods || [],
      isPublic: input.isPublic ?? false,
      metadata: input.metadata,
    })
    .onConflictDoNothing({ target: agentsTable.handle })
    .returning();

  if (result.length === 0) {
    throw new Error("HANDLE_CONFLICT");
  }

  const agent = result[0];

  try {
    const { getUserPlan } = await import("./billing");
    const plan = await getUserPlan(input.userId);
    const { getPlanLimits } = await import("./billing");
    const limits = getPlanLimits(plan);
    if (limits.canReceiveMail) {
      const { provisionInboxForAgent } = await import("./mail");
      await provisionInboxForAgent(agent.id);
    } else {
      logger.info({ agentId: agent.id, plan }, "[agents] Skipping inbox provisioning — plan does not include mail");
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err, agentId: agent.id }, "[agents] Failed to provision inbox for agent");
  }

  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, input.userId) });
    if (user?.email) {
      const { sendAgentRegisteredEmail } = await import("./email");
      await sendAgentRegisteredEmail(user.email, agent.handle, agent.displayName);
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err, agentId: agent.id }, "[agents] Failed to send registration email for agent");
  }

  return agent;
}

export async function getAgentById(agentId: string): Promise<Agent | null> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });
  return agent ?? null;
}

export async function getAgentByHandle(handle: string): Promise<Agent | null> {
  const agent = await db.query.agentsTable.findFirst({
    where: ilike(agentsTable.handle, handle),
  });
  return agent ?? null;
}

export async function listAgentsByUser(userId: string): Promise<Agent[]> {
  return db.query.agentsTable.findMany({
    where: eq(agentsTable.userId, userId),
    orderBy: (agents, { desc }) => [desc(agents.createdAt)],
  });
}

export async function updateAgent(
  agentId: string,
  userId: string,
  updates: UpdateAgentInput,
): Promise<Agent | null> {
  const existing = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
  });

  const finalUpdates = { ...updates };

  if (finalUpdates.metadata && existing?.metadata) {
    const existingMeta = (existing.metadata || {}) as Record<string, unknown>;
    const incomingMeta = (finalUpdates.metadata || {}) as Record<string, unknown>;
    if (existingMeta.handlePricing) {
      incomingMeta.handlePricing = existingMeta.handlePricing;
    }
    finalUpdates.metadata = incomingMeta;
  }

  const [updated] = await db
    .update(agentsTable)
    .set({ ...finalUpdates, updatedAt: new Date() })
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)))
    .returning();

  if (!updated) return null;

  if (updates.capabilities || updates.status) {
    try {
      const { deleteResolutionCache } = await import("../routes/v1/resolve");
      const { normalizeHandle } = await import("../utils/handle");
      await deleteResolutionCache(normalizeHandle(updated.handle));
    } catch {}
  }

  if (updates.status === "active" && existing?.status !== "active") {
    try {
      const { getUserPlan, getPlanLimits } = await import("./billing");
      const plan = await getUserPlan(userId);
      const limits = getPlanLimits(plan);
      if (limits.canReceiveMail) {
        const { provisionInboxForAgent } = await import("./mail");
        await provisionInboxForAgent(agentId);
      } else {
        logger.info({ agentId, plan }, "[agents] Skipping inbox provisioning on activation — plan does not include mail");
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err, agentId }, "[agents] Failed to provision inbox on activation");
    }
  }

  return updated;
}

export async function deleteAgent(
  agentId: string,
  userId: string,
): Promise<boolean> {
  const [deleted] = await db
    .delete(agentsTable)
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)))
    .returning({ id: agentsTable.id });

  return !!deleted;
}

const APP_URL = process.env.APP_URL || 'https://getagent.id';

export function toPublicProfile(agent: Agent, credential?: Record<string, unknown> | null) {
  const handle = agent.handle;
  const did = `did:agentid:${handle}`;
  const protocolAddress = `${handle}.agentid`;
  const erc8004Uri = `${APP_URL}/api/v1/p/${handle}/erc8004`;
  const domainName = `${handle}.getagent.id`;

  return {
    agent: {
      id: agent.id,
      handle: agent.handle,
      displayName: agent.displayName,
      description: agent.description,
      avatarUrl: agent.avatarUrl,
      status: agent.status,
      capabilities: agent.capabilities,
      protocols: agent.protocols,
      trustScore: agent.trustScore,
      trustTier: agent.trustTier,
      verificationStatus: agent.verificationStatus,
      verificationMethod: agent.verificationMethod,
      verifiedAt: agent.verifiedAt,
      tasksReceived: agent.tasksReceived,
      tasksCompleted: agent.tasksCompleted,
      createdAt: agent.createdAt,
      endpointUrl: agent.endpointUrl,
      isClaimed: agent.isClaimed,
      ownerVerifiedAt: agent.ownerVerifiedAt,
      did,
      protocolAddress,
      erc8004Uri,
      domainName,
    },
    trustBreakdown: {
      verification: agent.trustBreakdown?.verification ?? 0,
      longevity: agent.trustBreakdown?.longevity ?? 0,
      activity: agent.trustBreakdown?.activity ?? 0,
      reputation: agent.trustBreakdown?.reputation ?? 0,
    },
    recentActivity: [],
    listings: [],
    credential: credential ?? null,
  };
}
