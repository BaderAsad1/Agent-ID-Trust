import { eq, and, gte, lte, ilike, sql, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  a2aServiceListingsTable,
  agentsTable,
  type A2AServiceListing,
} from "@workspace/db/schema";
import { agentOwnerWhere } from "./agents";

export interface CreateA2AServiceInput {
  agentId: string;
  userId: string;
  name: string;
  description?: string;
  capabilityType: string;
  capabilitySchema?: {
    inputTypes: string[];
    outputTypes: string[];
    sampleInput?: Record<string, unknown>;
    sampleOutput?: Record<string, unknown>;
  };
  latencySlaMs?: number;
  maxConcurrentCalls?: number;
  pricingModel: "per_call" | "per_token" | "per_second";
  pricePerCallUsdc?: string;
  pricePerTokenUsdc?: string;
  pricePerSecondUsdc?: string;
  tags?: string[];
  endpointPath?: string;
  requiresAuth?: boolean;
}

export interface A2AServiceFilters {
  capabilityType?: string;
  pricingModel?: string;
  minPriceUsdc?: number;
  maxPriceUsdc?: number;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function createA2AService(
  input: CreateA2AServiceInput,
): Promise<{ success: boolean; service?: A2AServiceListing; error?: string }> {
  const agent = await db.query.agentsTable.findFirst({
    where: agentOwnerWhere(input.agentId, input.userId),
    columns: { id: true, status: true },
  });

  if (!agent) return { success: false, error: "AGENT_NOT_FOUND" };
  if (agent.status !== "active") return { success: false, error: "AGENT_NOT_ACTIVE" };

  const [service] = await db
    .insert(a2aServiceListingsTable)
    .values({
      agentId: input.agentId,
      userId: input.userId,
      name: input.name,
      description: input.description,
      capabilityType: input.capabilityType,
      capabilitySchema: input.capabilitySchema,
      latencySlaMs: input.latencySlaMs,
      maxConcurrentCalls: input.maxConcurrentCalls ?? 10,
      pricingModel: input.pricingModel,
      pricePerCallUsdc: input.pricePerCallUsdc,
      pricePerTokenUsdc: input.pricePerTokenUsdc,
      pricePerSecondUsdc: input.pricePerSecondUsdc,
      tags: input.tags ?? [],
      endpointPath: input.endpointPath,
      requiresAuth: input.requiresAuth ?? true,
      status: "active",
    })
    .returning();

  return { success: true, service };
}

export async function listA2AServices(
  filters: A2AServiceFilters,
): Promise<{ services: A2AServiceListing[]; total: number }> {
  const conditions = [];

  const status = filters.status ?? "active";
  conditions.push(eq(a2aServiceListingsTable.status, status));

  if (filters.capabilityType) {
    conditions.push(eq(a2aServiceListingsTable.capabilityType, filters.capabilityType));
  }

  if (filters.pricingModel) {
    conditions.push(eq(a2aServiceListingsTable.pricingModel, filters.pricingModel));
  }

  if (filters.search) {
    conditions.push(ilike(a2aServiceListingsTable.name, `%${filters.search}%`));
  }

  if (filters.minPriceUsdc !== undefined) {
    conditions.push(
      gte(
        sql`COALESCE(${a2aServiceListingsTable.pricePerCallUsdc}::numeric, 0)`,
        sql`${filters.minPriceUsdc}`,
      ),
    );
  }

  if (filters.maxPriceUsdc !== undefined) {
    conditions.push(
      lte(
        sql`COALESCE(${a2aServiceListingsTable.pricePerCallUsdc}::numeric, 0)`,
        sql`${filters.maxPriceUsdc}`,
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(filters.limit ?? 20, 100);
  const offset = filters.offset ?? 0;

  const [services, countResult] = await Promise.all([
    db
      .select()
      .from(a2aServiceListingsTable)
      .where(where)
      .orderBy(desc(a2aServiceListingsTable.totalCalls))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(a2aServiceListingsTable)
      .where(where),
  ]);

  return { services, total: countResult[0]?.count ?? 0 };
}

export async function getA2AServiceById(
  serviceId: string,
): Promise<A2AServiceListing | null> {
  const service = await db.query.a2aServiceListingsTable.findFirst({
    where: eq(a2aServiceListingsTable.id, serviceId),
  });
  return service ?? null;
}

export async function updateA2AService(
  serviceId: string,
  userId: string,
  updates: Partial<CreateA2AServiceInput>,
): Promise<{ success: boolean; service?: A2AServiceListing; error?: string }> {
  const existing = await db.query.a2aServiceListingsTable.findFirst({
    where: and(
      eq(a2aServiceListingsTable.id, serviceId),
      eq(a2aServiceListingsTable.userId, userId),
    ),
  });

  if (!existing) return { success: false, error: "SERVICE_NOT_FOUND" };

  const setValues: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.capabilityType !== undefined) setValues.capabilityType = updates.capabilityType;
  if (updates.capabilitySchema !== undefined) setValues.capabilitySchema = updates.capabilitySchema;
  if (updates.latencySlaMs !== undefined) setValues.latencySlaMs = updates.latencySlaMs;
  if (updates.maxConcurrentCalls !== undefined) setValues.maxConcurrentCalls = updates.maxConcurrentCalls;
  if (updates.pricingModel !== undefined) setValues.pricingModel = updates.pricingModel;
  if (updates.pricePerCallUsdc !== undefined) setValues.pricePerCallUsdc = updates.pricePerCallUsdc;
  if (updates.pricePerTokenUsdc !== undefined) setValues.pricePerTokenUsdc = updates.pricePerTokenUsdc;
  if (updates.pricePerSecondUsdc !== undefined) setValues.pricePerSecondUsdc = updates.pricePerSecondUsdc;
  if (updates.tags !== undefined) setValues.tags = updates.tags;
  if (updates.endpointPath !== undefined) setValues.endpointPath = updates.endpointPath;
  if (updates.requiresAuth !== undefined) setValues.requiresAuth = updates.requiresAuth;

  const [updated] = await db
    .update(a2aServiceListingsTable)
    .set(setValues)
    .where(eq(a2aServiceListingsTable.id, serviceId))
    .returning();

  return { success: true, service: updated };
}

export async function deleteA2AService(
  serviceId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const existing = await db.query.a2aServiceListingsTable.findFirst({
    where: and(
      eq(a2aServiceListingsTable.id, serviceId),
      eq(a2aServiceListingsTable.userId, userId),
    ),
  });

  if (!existing) return { success: false, error: "SERVICE_NOT_FOUND" };

  await db
    .update(a2aServiceListingsTable)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(eq(a2aServiceListingsTable.id, serviceId));

  return { success: true };
}

export async function incrementA2AServiceCallCount(serviceId: string): Promise<void> {
  await db
    .update(a2aServiceListingsTable)
    .set({
      totalCalls: sql`${a2aServiceListingsTable.totalCalls} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(a2aServiceListingsTable.id, serviceId));
}
