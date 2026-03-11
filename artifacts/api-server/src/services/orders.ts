import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  marketplaceOrdersTable,
  marketplaceListingsTable,
  payoutLedgerTable,
  paymentLedgerTable,
  type MarketplaceOrder,
} from "@workspace/db/schema";
import { submitTask } from "./tasks";
import { calculatePlatformFee } from "./marketplace";
import { logActivity } from "./activity-logger";

export interface CreateOrderInput {
  listingId: string;
  buyerUserId: string;
  taskDescription?: string;
  paymentProvider?: string;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<{ success: boolean; order?: MarketplaceOrder; error?: string }> {
  const listing = await db.query.marketplaceListingsTable.findFirst({
    where: and(
      eq(marketplaceListingsTable.id, input.listingId),
      eq(marketplaceListingsTable.status, "active"),
    ),
  });

  if (!listing) return { success: false, error: "LISTING_NOT_FOUND" };
  if (listing.userId === input.buyerUserId) {
    return { success: false, error: "CANNOT_ORDER_OWN_LISTING" };
  }

  const priceAmount = Number(listing.priceAmount ?? 0);
  const { platformFee, sellerPayout } = calculatePlatformFee(priceAmount);

  const [order] = await db
    .insert(marketplaceOrdersTable)
    .values({
      listingId: listing.id,
      buyerUserId: input.buyerUserId,
      sellerUserId: listing.userId,
      agentId: listing.agentId,
      taskDescription: input.taskDescription,
      priceAmount: priceAmount.toFixed(2),
      platformFee: platformFee.toFixed(2),
      sellerPayout: sellerPayout.toFixed(2),
      status: "pending",
      paymentProvider: input.paymentProvider ?? "stripe",
    })
    .returning();

  const task = await submitTask({
    recipientAgentId: listing.agentId,
    senderUserId: input.buyerUserId,
    taskType: "marketplace_order",
    payload: {
      orderId: order.id,
      listingId: listing.id,
      listingTitle: listing.title,
      taskDescription: input.taskDescription,
    },
    relatedOrderId: order.id,
  });

  await logActivity({
    agentId: listing.agentId,
    eventType: "agent.task_received",
    payload: {
      orderId: order.id,
      taskId: task.id,
      listingTitle: listing.title,
      source: "marketplace",
    },
  });

  return { success: true, order };
}

export async function confirmOrder(
  orderId: string,
  sellerUserId: string,
): Promise<{ success: boolean; order?: MarketplaceOrder; error?: string }> {
  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: and(
      eq(marketplaceOrdersTable.id, orderId),
      eq(marketplaceOrdersTable.sellerUserId, sellerUserId),
    ),
  });

  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.status !== "pending") {
    return { success: false, error: `INVALID_STATUS:${order.status}` };
  }

  const [updated] = await db
    .update(marketplaceOrdersTable)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(marketplaceOrdersTable.id, orderId))
    .returning();

  return { success: true, order: updated };
}

export async function completeOrder(
  orderId: string,
  sellerUserId: string,
): Promise<{ success: boolean; order?: MarketplaceOrder; error?: string }> {
  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: and(
      eq(marketplaceOrdersTable.id, orderId),
      eq(marketplaceOrdersTable.sellerUserId, sellerUserId),
    ),
  });

  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.status !== "confirmed" && order.status !== "in_progress") {
    return { success: false, error: `INVALID_STATUS:${order.status}` };
  }

  const [updated] = await db
    .update(marketplaceOrdersTable)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(marketplaceOrdersTable.id, orderId))
    .returning();

  await db
    .update(marketplaceListingsTable)
    .set({
      totalHires: sql`${marketplaceListingsTable.totalHires} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceListingsTable.id, order.listingId));

  await db.insert(payoutLedgerTable).values({
    relatedOrderId: orderId,
    sellerUserId: order.sellerUserId,
    provider: order.paymentProvider ?? "stripe",
    amount: order.sellerPayout,
    currency: "USD",
    status: "pending",
    metadata: {
      orderId,
      listingId: order.listingId,
      totalPrice: order.priceAmount,
      platformFee: order.platformFee,
    },
  });

  await db.insert(paymentLedgerTable).values([
    {
      relatedOrderId: orderId,
      provider: order.paymentProvider ?? "stripe",
      direction: "inbound",
      accountType: "user",
      accountId: order.buyerUserId,
      amount: order.priceAmount,
      currency: "USD",
      entryType: "order_payment",
      metadata: { orderId, listingId: order.listingId },
    },
    {
      relatedOrderId: orderId,
      provider: order.paymentProvider ?? "stripe",
      direction: "outbound",
      accountType: "platform",
      accountId: order.sellerUserId,
      amount: order.platformFee,
      currency: "USD",
      entryType: "platform_fee",
      metadata: { orderId },
    },
  ]);

  await logActivity({
    agentId: order.agentId,
    eventType: "agent.task_completed",
    payload: { orderId, source: "marketplace", sellerPayout: order.sellerPayout },
  });

  return { success: true, order: updated };
}

export async function cancelOrder(
  orderId: string,
  userId: string,
): Promise<{ success: boolean; order?: MarketplaceOrder; error?: string }> {
  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: eq(marketplaceOrdersTable.id, orderId),
  });

  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.buyerUserId !== userId && order.sellerUserId !== userId) {
    return { success: false, error: "ORDER_NOT_FOUND" };
  }
  if (order.status === "completed" || order.status === "cancelled") {
    return { success: false, error: `INVALID_STATUS:${order.status}` };
  }

  const [updated] = await db
    .update(marketplaceOrdersTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(marketplaceOrdersTable.id, orderId))
    .returning();

  return { success: true, order: updated };
}

export async function getOrderById(
  orderId: string,
  userId: string,
): Promise<MarketplaceOrder | null> {
  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: eq(marketplaceOrdersTable.id, orderId),
  });
  if (!order) return null;
  if (order.buyerUserId !== userId && order.sellerUserId !== userId) return null;
  return order;
}

export async function listOrders(
  userId: string,
  role: "buyer" | "seller" | "all",
  limit = 20,
  offset = 0,
): Promise<{ orders: MarketplaceOrder[]; total: number }> {
  const col =
    role === "buyer"
      ? marketplaceOrdersTable.buyerUserId
      : role === "seller"
        ? marketplaceOrdersTable.sellerUserId
        : null;

  const where = col
    ? eq(col, userId)
    : sql`(${marketplaceOrdersTable.buyerUserId} = ${userId} OR ${marketplaceOrdersTable.sellerUserId} = ${userId})`;

  const [orders, countResult] = await Promise.all([
    db
      .select()
      .from(marketplaceOrdersTable)
      .where(where)
      .orderBy(desc(marketplaceOrdersTable.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketplaceOrdersTable)
      .where(where),
  ]);

  return { orders, total: countResult[0]?.count ?? 0 };
}
