import { eq, and, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, type Agent } from "@workspace/db/schema";

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
const RESERVED_HANDLES = new Set([
  "admin", "api", "system", "root", "agent", "agents",
  "help", "support", "billing", "status", "www",
]);

export function validateHandle(handle: string): string | null {
  if (!HANDLE_RE.test(handle)) {
    return "Handle must be 3-100 lowercase alphanumeric characters or hyphens, starting and ending with alphanumeric";
  }
  if (RESERVED_HANDLES.has(handle)) {
    return "This handle is reserved";
  }
  return null;
}

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const existing = await db.query.agentsTable.findFirst({
    where: ilike(agentsTable.handle, handle),
    columns: { id: true },
  });
  return !existing;
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
    const { provisionInboxForAgent } = await import("./mail");
    await provisionInboxForAgent(agent.id);
  } catch (err) {
    console.error(`[agents] Failed to provision inbox for agent ${agent.id}:`, err instanceof Error ? err.message : err);
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
    columns: { status: true },
  });

  const [updated] = await db
    .update(agentsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)))
    .returning();

  if (!updated) return null;

  if (updates.status === "active" && existing?.status !== "active") {
    try {
      const { provisionInboxForAgent } = await import("./mail");
      await provisionInboxForAgent(agentId);
    } catch (err) {
      console.error(`[agents] Failed to provision inbox on activation for ${agentId}:`, err instanceof Error ? err.message : err);
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

export function toPublicProfile(agent: Agent) {
  return {
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
  };
}
