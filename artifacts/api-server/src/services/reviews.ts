import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  marketplaceReviewsTable,
  marketplaceOrdersTable,
  marketplaceListingsTable,
  type MarketplaceReview,
} from "@workspace/db/schema";
import { recomputeAndStore, addReputationEvent } from "./trust-score";

export interface CreateReviewInput {
  orderId: string;
  reviewerId: string;
  rating: number;
  comment?: string;
}

export async function createReview(
  input: CreateReviewInput,
): Promise<{ success: boolean; review?: MarketplaceReview; error?: string }> {
  if (input.rating < 1 || input.rating > 5) {
    return { success: false, error: "INVALID_RATING" };
  }

  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: and(
      eq(marketplaceOrdersTable.id, input.orderId),
      eq(marketplaceOrdersTable.buyerUserId, input.reviewerId),
    ),
  });

  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.status !== "completed") {
    return { success: false, error: "ORDER_NOT_COMPLETED" };
  }

  const existingReview = await db.query.marketplaceReviewsTable.findFirst({
    where: eq(marketplaceReviewsTable.orderId, input.orderId),
  });

  if (existingReview) {
    return { success: false, error: "REVIEW_ALREADY_EXISTS" };
  }

  const [review] = await db
    .insert(marketplaceReviewsTable)
    .values({
      orderId: input.orderId,
      listingId: order.listingId,
      reviewerId: input.reviewerId,
      agentId: order.agentId,
      rating: input.rating,
      comment: input.comment,
    })
    .returning();

  await updateListingStats(order.listingId);

  const eventType = input.rating >= 4 ? "positive_review" : input.rating <= 2 ? "negative_review" : "neutral_review";
  const weight = input.rating >= 4 ? 2 : input.rating <= 2 ? -3 : 0;

  await addReputationEvent(
    order.agentId,
    eventType,
    weight,
    `marketplace_review:${review.id}:rating_${input.rating}`,
  );

  await recomputeAndStore(order.agentId);

  return { success: true, review };
}

async function updateListingStats(listingId: string): Promise<void> {
  const stats = await db
    .select({
      avgRating: sql<string>`ROUND(AVG(${marketplaceReviewsTable.rating})::numeric, 2)`,
      reviewCount: sql<number>`COUNT(*)::int`,
    })
    .from(marketplaceReviewsTable)
    .where(eq(marketplaceReviewsTable.listingId, listingId));

  if (stats[0]) {
    await db
      .update(marketplaceListingsTable)
      .set({
        avgRating: stats[0].avgRating,
        reviewCount: stats[0].reviewCount,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListingsTable.id, listingId));
  }
}

export async function getReviewsByListing(
  listingId: string,
  limit = 20,
  offset = 0,
): Promise<{ reviews: MarketplaceReview[]; total: number }> {
  const [reviews, countResult] = await Promise.all([
    db
      .select()
      .from(marketplaceReviewsTable)
      .where(eq(marketplaceReviewsTable.listingId, listingId))
      .orderBy(desc(marketplaceReviewsTable.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketplaceReviewsTable)
      .where(eq(marketplaceReviewsTable.listingId, listingId)),
  ]);

  return { reviews, total: countResult[0]?.count ?? 0 };
}

export async function getReviewsByAgent(
  agentId: string,
  limit = 20,
  offset = 0,
): Promise<{ reviews: MarketplaceReview[]; total: number }> {
  const [reviews, countResult] = await Promise.all([
    db
      .select()
      .from(marketplaceReviewsTable)
      .where(eq(marketplaceReviewsTable.agentId, agentId))
      .orderBy(desc(marketplaceReviewsTable.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketplaceReviewsTable)
      .where(eq(marketplaceReviewsTable.agentId, agentId)),
  ]);

  return { reviews, total: countResult[0]?.count ?? 0 };
}
