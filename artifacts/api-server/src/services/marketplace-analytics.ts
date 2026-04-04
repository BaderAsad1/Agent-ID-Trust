import { eq, and, gte, sql, count } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  marketplaceAnalyticsEventsTable,
  marketplaceListingsTable,
  marketplaceOrdersTable,
  marketplaceReviewsTable,
} from "@workspace/db/schema";

export type AnalyticsEventType =
  | "listing_view"
  | "hire_initiated"
  | "hire_completed"
  | "hire_cancelled"
  | "a2a_call";

export async function trackAnalyticsEvent(params: {
  eventType: AnalyticsEventType;
  listingId?: string;
  userId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(marketplaceAnalyticsEventsTable).values({
      eventType: params.eventType,
      listingId: params.listingId,
      userId: params.userId,
      agentId: params.agentId,
      metadata: params.metadata,
    });
  } catch {
  }
}

export async function getListingAnalytics(listingId: string): Promise<{
  views: number;
  hireInitiated: number;
  hireCompleted: number;
  hireCancelled: number;
  conversionRate: number;
  revenue: string;
  avgRating: number | null;
  reviewCount: number;
}> {
  const [eventsResult, ordersResult, ratingsResult] = await Promise.all([
    db
      .select({
        eventType: marketplaceAnalyticsEventsTable.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(marketplaceAnalyticsEventsTable)
      .where(eq(marketplaceAnalyticsEventsTable.listingId, listingId))
      .groupBy(marketplaceAnalyticsEventsTable.eventType),
    db
      .select({
        revenue: sql<string>`coalesce(sum(${marketplaceOrdersTable.priceAmount}), 0)::text`,
      })
      .from(marketplaceOrdersTable)
      .where(
        and(
          eq(marketplaceOrdersTable.listingId, listingId),
          eq(marketplaceOrdersTable.status, "completed"),
        ),
      ),
    db
      .select({
        avgRating: sql<number>`avg(${marketplaceReviewsTable.rating})::float`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(marketplaceReviewsTable)
      .where(eq(marketplaceReviewsTable.listingId, listingId)),
  ]);

  const eventMap: Record<string, number> = {};
  for (const row of eventsResult) {
    eventMap[row.eventType] = row.count;
  }

  const views = eventMap["listing_view"] ?? 0;
  const hireInitiated = eventMap["hire_initiated"] ?? 0;
  const hireCompleted = eventMap["hire_completed"] ?? 0;
  const hireCancelled = eventMap["hire_cancelled"] ?? 0;
  const conversionRate = views > 0 ? Math.round((hireCompleted / views) * 10000) / 100 : 0;
  const revenue = ordersResult[0]?.revenue ?? "0";
  const avgRating = ratingsResult[0]?.avgRating ?? null;
  const reviewCount = ratingsResult[0]?.reviewCount ?? 0;

  return {
    views,
    hireInitiated,
    hireCompleted,
    hireCancelled,
    conversionRate,
    revenue,
    avgRating,
    reviewCount,
  };
}
