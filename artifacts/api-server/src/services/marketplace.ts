import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  marketplaceListingsTable,
  agentsTable,
  type MarketplaceListing,
} from "@workspace/db/schema";
import { logActivity } from "./activity-logger";
import { requirePlanFeature } from "./billing";
import { agentOwnerWhere } from "./agents";

export interface ListingPackage {
  name: string;
  description?: string;
  deliverables?: string[];
  priceUsdc: string;
  deliveryDays: number;
}

export interface CreateListingInput {
  agentId: string;
  userId: string;
  title: string;
  description?: string;
  category?: string;
  pitch?: string;
  priceType?: "fixed" | "hourly" | "per_task" | "custom";
  priceAmount?: string;
  deliveryHours?: number;
  capabilities?: string[];
  listingMode?: "h2a" | "a2a" | "both";
  packages?: ListingPackage[];
}

export interface UpdateListingInput {
  title?: string;
  description?: string;
  category?: string;
  pitch?: string;
  priceType?: "fixed" | "hourly" | "per_task" | "custom";
  priceAmount?: string;
  deliveryHours?: number;
  capabilities?: string[];
  status?: "draft" | "active" | "paused" | "closed";
  listingMode?: "h2a" | "a2a" | "both";
  packages?: ListingPackage[];
}

export interface ListingFilters {
  category?: string;
  status?: string;
  agentId?: string;
  featured?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "created" | "rating" | "hires" | "price";
  sortOrder?: "asc" | "desc";
  listingMode?: string;
}

const PLATFORM_FEE_RATE = 0.10;

export function calculatePlatformFee(amount: number): {
  platformFee: number;
  sellerPayout: number;
} {
  const platformFee = Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
  const sellerPayout = Math.round((amount - platformFee) * 100) / 100;
  return { platformFee, sellerPayout };
}

async function checkListingEligibility(
  agentId: string,
  userId: string,
): Promise<{ eligible: boolean; reason?: string }> {
  const agent = await db.query.agentsTable.findFirst({
    where: agentOwnerWhere(agentId, userId),
  });

  if (!agent) return { eligible: false, reason: "AGENT_NOT_FOUND" };
  if (agent.status !== "active") return { eligible: false, reason: "AGENT_NOT_ACTIVE" };
  if (agent.verificationStatus !== "verified") return { eligible: false, reason: "AGENT_NOT_VERIFIED" };

  const planCheck = await requirePlanFeature(userId, "canListOnMarketplace");
  if (!planCheck.allowed) {
    return { eligible: false, reason: `PLAN_UPGRADE_REQUIRED:${planCheck.requiredPlan}` };
  }

  return { eligible: true };
}

export async function createListing(
  input: CreateListingInput,
): Promise<{ success: boolean; listing?: MarketplaceListing; error?: string }> {
  const eligibility = await checkListingEligibility(input.agentId, input.userId);
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason };
  }

  const [listing] = await db
    .insert(marketplaceListingsTable)
    .values({
      agentId: input.agentId,
      userId: input.userId,
      title: input.title,
      description: input.description,
      category: input.category,
      pitch: input.pitch,
      priceType: input.priceType ?? "fixed",
      priceAmount: input.priceAmount,
      deliveryHours: input.deliveryHours,
      capabilities: input.capabilities ?? [],
      listingMode: input.listingMode ?? "h2a",
      packages: input.packages ?? [],
      status: "draft",
    })
    .returning();

  await logActivity({
    agentId: input.agentId,
    eventType: "agent.listing_created",
    payload: { listingId: listing.id, title: input.title },
  });

  return { success: true, listing };
}

export async function updateListing(
  listingId: string,
  userId: string,
  updates: UpdateListingInput,
): Promise<{ success: boolean; listing?: MarketplaceListing; error?: string }> {
  const existing = await db.query.marketplaceListingsTable.findFirst({
    where: and(
      eq(marketplaceListingsTable.id, listingId),
      eq(marketplaceListingsTable.userId, userId),
    ),
  });

  if (!existing) return { success: false, error: "LISTING_NOT_FOUND" };

  if (updates.status === "active" && existing.status !== "active") {
    const eligibility = await checkListingEligibility(existing.agentId, userId);
    if (!eligibility.eligible) {
      return { success: false, error: eligibility.reason };
    }
  }

  const setValues: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.title !== undefined) setValues.title = updates.title;
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.category !== undefined) setValues.category = updates.category;
  if (updates.pitch !== undefined) setValues.pitch = updates.pitch;
  if (updates.priceType !== undefined) setValues.priceType = updates.priceType;
  if (updates.priceAmount !== undefined) setValues.priceAmount = updates.priceAmount;
  if (updates.deliveryHours !== undefined) setValues.deliveryHours = updates.deliveryHours;
  if (updates.capabilities !== undefined) setValues.capabilities = updates.capabilities;
  if (updates.status !== undefined) setValues.status = updates.status;
  if (updates.listingMode !== undefined) setValues.listingMode = updates.listingMode;
  if (updates.packages !== undefined) setValues.packages = updates.packages;

  const [updated] = await db
    .update(marketplaceListingsTable)
    .set(setValues)
    .where(eq(marketplaceListingsTable.id, listingId))
    .returning();

  await logActivity({
    agentId: existing.agentId,
    eventType: "agent.listing_updated",
    payload: { listingId, updates: Object.keys(updates) },
  });

  return { success: true, listing: updated };
}

export async function deleteListing(
  listingId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const existing = await db.query.marketplaceListingsTable.findFirst({
    where: and(
      eq(marketplaceListingsTable.id, listingId),
      eq(marketplaceListingsTable.userId, userId),
    ),
  });

  if (!existing) return { success: false, error: "LISTING_NOT_FOUND" };

  await db
    .update(marketplaceListingsTable)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(marketplaceListingsTable.id, listingId));

  return { success: true };
}

export async function getListingById(
  listingId: string,
): Promise<MarketplaceListing | null> {
  const listing = await db.query.marketplaceListingsTable.findFirst({
    where: eq(marketplaceListingsTable.id, listingId),
  });
  return listing ?? null;
}

export async function incrementListingViews(listingId: string): Promise<void> {
  await db
    .update(marketplaceListingsTable)
    .set({
      views: sql`${marketplaceListingsTable.views} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceListingsTable.id, listingId));
}

export async function listListings(
  filters: ListingFilters,
): Promise<{ listings: MarketplaceListing[]; total: number }> {
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(marketplaceListingsTable.status, filters.status as "draft" | "active" | "paused" | "closed"));
  } else {
    conditions.push(eq(marketplaceListingsTable.status, "active"));
  }

  if (filters.category) {
    conditions.push(eq(marketplaceListingsTable.category, filters.category));
  }
  if (filters.agentId) {
    conditions.push(eq(marketplaceListingsTable.agentId, filters.agentId));
  }
  if (filters.featured !== undefined) {
    conditions.push(eq(marketplaceListingsTable.featured, filters.featured));
  }
  if (filters.search) {
    conditions.push(ilike(marketplaceListingsTable.title, `%${filters.search}%`));
  }
  if (filters.listingMode) {
    conditions.push(sql`${marketplaceListingsTable.listingMode} IN (${filters.listingMode}, 'both')`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let orderBy;
  const dir = filters.sortOrder === "asc" ? sql`ASC` : sql`DESC`;
  switch (filters.sortBy) {
    case "rating":
      orderBy = sql`${marketplaceListingsTable.avgRating} ${dir} NULLS LAST`;
      break;
    case "hires":
      orderBy = sql`${marketplaceListingsTable.totalHires} ${dir}`;
      break;
    case "price":
      orderBy = sql`${marketplaceListingsTable.priceAmount} ${dir} NULLS LAST`;
      break;
    default:
      orderBy = sql`${marketplaceListingsTable.createdAt} ${dir}`;
  }

  const limit = Math.min(filters.limit ?? 20, 100);
  const offset = filters.offset ?? 0;

  const [listings, countResult] = await Promise.all([
    db
      .select()
      .from(marketplaceListingsTable)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketplaceListingsTable)
      .where(where),
  ]);

  return { listings, total: countResult[0]?.count ?? 0 };
}

export async function getMyListings(
  userId: string,
): Promise<MarketplaceListing[]> {
  return db
    .select()
    .from(marketplaceListingsTable)
    .where(eq(marketplaceListingsTable.userId, userId))
    .orderBy(desc(marketplaceListingsTable.createdAt));
}
