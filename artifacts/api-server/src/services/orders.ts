import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../middlewares/request-logger";
import { db } from "@workspace/db";
import {
  marketplaceOrdersTable,
  marketplaceListingsTable,
  payoutLedgerTable,
  paymentLedgerTable,
  usersTable,
  type MarketplaceOrder,
} from "@workspace/db/schema";
import { submitTask } from "./tasks";
import { calculatePlatformFee } from "./marketplace";
import { logActivity } from "./activity-logger";
import { getStripe } from "./stripe-client";
import { captureProviderPayment, refundProviderPayment } from "./payment-providers";

export interface CreateOrderInput {
  listingId: string;
  buyerUserId: string;
  taskDescription?: string;
}

export interface CreateOrderResult {
  success: boolean;
  order?: MarketplaceOrder;
  clientSecret?: string;
  error?: string;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
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

  let stripePaymentIntentId: string | undefined;
  let clientSecret: string | undefined;

  try {
    const stripe = getStripe();
    const amountInCents = Math.round(priceAmount * 100);
    const pi = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      capture_method: "manual",
      metadata: {
        buyerUserId: input.buyerUserId,
        sellerUserId: listing.userId,
        listingId: listing.id,
        listingTitle: listing.title,
      },
    });
    stripePaymentIntentId = pi.id;
    clientSecret = pi.client_secret ?? undefined;
  } catch (err) {
    console.error("[orders] Failed to create Stripe PaymentIntent:", err);
    return {
      success: false,
      error: "PAYMENT_INTENT_FAILED",
    };
  }

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
      status: "payment_pending",
      paymentProvider: "stripe",
      providerPaymentReference: stripePaymentIntentId,
    })
    .returning();

  if (stripePaymentIntentId && order) {
    try {
      const stripe = getStripe();
      await stripe.paymentIntents.update(stripePaymentIntentId, {
        metadata: {
          orderId: order.id,
          buyerUserId: input.buyerUserId,
          sellerUserId: listing.userId,
          listingId: listing.id,
          listingTitle: listing.title,
        },
      });
    } catch (err) {
      console.error("[orders] Failed to update PaymentIntent metadata with orderId:", err);
    }
  }

  return { success: true, order, clientSecret };
}

export async function confirmPayment(
  orderId: string,
  buyerUserId: string,
): Promise<{ success: boolean; order?: MarketplaceOrder; error?: string }> {
  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: and(
      eq(marketplaceOrdersTable.id, orderId),
      eq(marketplaceOrdersTable.buyerUserId, buyerUserId),
    ),
  });

  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.status !== "payment_pending") {
    return { success: false, error: `INVALID_STATUS:${order.status}` };
  }

  if (order.providerPaymentReference) {
    try {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(order.providerPaymentReference);
      if (pi.status !== "requires_capture") {
        return { success: false, error: `PAYMENT_NOT_AUTHORIZED:${pi.status}` };
      }
    } catch (err) {
      console.error(`[orders] Failed to verify PaymentIntent for order ${orderId}:`, err);
      return { success: false, error: "PAYMENT_VERIFICATION_FAILED" };
    }
  }

  const [updated] = await db
    .update(marketplaceOrdersTable)
    .set({ status: "pending", updatedAt: new Date() })
    .where(eq(marketplaceOrdersTable.id, orderId))
    .returning();

  const listing = await db.query.marketplaceListingsTable.findFirst({
    where: eq(marketplaceListingsTable.id, order.listingId),
  });

  const task = await submitTask({
    recipientAgentId: order.agentId,
    senderUserId: order.buyerUserId,
    taskType: "marketplace_order",
    payload: {
      orderId: order.id,
      listingId: order.listingId,
      listingTitle: listing?.title ?? "Unknown",
      taskDescription: order.taskDescription,
    },
    relatedOrderId: order.id,
  });

  await logActivity({
    agentId: order.agentId,
    eventType: "agent.task_received",
    payload: {
      orderId: order.id,
      taskId: task.id,
      listingTitle: listing?.title,
      source: "marketplace",
    },
  });

  try {
    const seller = await db.query.usersTable.findFirst({ where: eq(usersTable.id, order.sellerUserId) });
    if (seller?.email) {
      const { sendMarketplaceOrderEmail } = await import("./email.js");
      await sendMarketplaceOrderEmail(seller.email, listing?.title ?? "Marketplace Order", Number(order.priceAmount).toFixed(2));
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "[orders] Failed to send order email");
  }

  return { success: true, order: updated };
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

  if (order.providerPaymentReference) {
    const captureResult = await captureProviderPayment(
      order.paymentProvider ?? "stripe",
      order.providerPaymentReference,
    );
    if (!captureResult.success) {
      console.error(`[orders] Failed to capture payment for order ${orderId}:`, captureResult.error);
      return { success: false, error: `PAYMENT_CAPTURE_FAILED:${captureResult.error}` };
    }
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
): Promise<{
  success: boolean;
  order?: MarketplaceOrder;
  error?: string;
  payoutStatus?: string;
  payoutNote?: string;
}> {
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

  const paymentRef = order.providerPaymentReference ?? undefined;

  await db.insert(payoutLedgerTable).values({
    relatedOrderId: orderId,
    sellerUserId: order.sellerUserId,
    provider: order.paymentProvider ?? "stripe",
    amount: order.sellerPayout,
    currency: "USD",
    status: "pending_manual_payout",
    metadata: {
      orderId,
      listingId: order.listingId,
      totalPrice: order.priceAmount,
      platformFee: order.platformFee,
      stripePaymentIntentId: paymentRef,
      note: "Stripe Connect seller payout not yet implemented — requires manual processing",
    },
  });

  console.warn(`[PAYOUT REQUIRED] Order ${orderId ?? "unknown"} | Action needed in Stripe Dashboard: https://dashboard.stripe.com/transfers`);

  const PLATFORM_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";

  await db.insert(paymentLedgerTable).values([
    {
      relatedOrderId: orderId,
      provider: order.paymentProvider ?? "stripe",
      direction: "outbound",
      accountType: "user",
      accountId: order.buyerUserId,
      amount: order.priceAmount,
      currency: "USD",
      entryType: "order_payment",
      metadata: {
        orderId,
        listingId: order.listingId,
        stripePaymentIntentId: paymentRef,
      },
    },
    {
      relatedOrderId: orderId,
      provider: order.paymentProvider ?? "stripe",
      direction: "inbound",
      accountType: "platform",
      accountId: PLATFORM_ACCOUNT_ID,
      amount: order.platformFee,
      currency: "USD",
      entryType: "platform_fee",
      metadata: {
        orderId,
        buyerUserId: order.buyerUserId,
        stripePaymentIntentId: paymentRef,
      },
    },
    {
      relatedOrderId: orderId,
      provider: order.paymentProvider ?? "stripe",
      direction: "inbound",
      accountType: "user",
      accountId: order.sellerUserId,
      amount: order.sellerPayout,
      currency: "USD",
      entryType: "seller_payout",
      metadata: {
        orderId,
        listingId: order.listingId,
        stripePaymentIntentId: paymentRef,
        payoutStatus: "pending_manual_payout",
      },
    },
  ]);
  console.warn(`[PAYOUT REQUIRED] Order ${orderId ?? "unknown"} | Action needed in Stripe Dashboard: https://dashboard.stripe.com/transfers`);

  await logActivity({
    agentId: order.agentId,
    eventType: "agent.task_completed",
    payload: { orderId, source: "marketplace", sellerPayout: order.sellerPayout },
  });

  try {
    const listing = await db.query.marketplaceListingsTable.findFirst({
      where: eq(marketplaceListingsTable.id, order.listingId),
      columns: { title: true },
    });
    const listingTitle = listing?.title || "Marketplace order";
    const amount = String(order.priceAmount);

    const [seller, buyer] = await Promise.all([
      db.query.usersTable.findFirst({ where: eq(usersTable.id, order.sellerUserId), columns: { email: true } }),
      db.query.usersTable.findFirst({ where: eq(usersTable.id, order.buyerUserId), columns: { email: true } }),
    ]);

    const { sendOrderCompletedEmail } = await import("./email.js");
    const sends: Promise<void>[] = [];
    if (seller?.email) {
      sends.push(sendOrderCompletedEmail(seller.email, listingTitle, amount, orderId, "seller"));
    }
    if (buyer?.email) {
      sends.push(sendOrderCompletedEmail(buyer.email, listingTitle, amount, orderId, "buyer"));
    }
    await Promise.all(sends);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "[orders] Failed to send order completed email");
  }

  console.warn(`[PAYOUT REQUIRED] Order ${orderId ?? "unknown"} | Action needed in Stripe Dashboard: https://dashboard.stripe.com/transfers`);
  return {
    success: true,
    order: updated,
    payoutStatus: "pending_manual",
    payoutNote: "Seller payout requires manual settlement. Stripe Connect automated payouts are not yet implemented. Funds are held and will be disbursed manually by the platform operator.",
  };
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

  const capturedStatuses = ["confirmed", "in_progress"];
  const isCaptured = capturedStatuses.includes(order.status);

  if (order.providerPaymentReference) {
    if (isCaptured) {
      const refundResult = await refundProviderPayment(
        order.paymentProvider ?? "stripe",
        order.providerPaymentReference,
      );
      if (!refundResult.success) {
        console.error(`[orders] Failed to refund payment for order ${orderId}:`, refundResult.error);
        return { success: false, error: `REFUND_FAILED:${refundResult.error}` };
      }

      const PLATFORM_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";
      await db.insert(paymentLedgerTable).values([
        {
          relatedOrderId: orderId,
          provider: order.paymentProvider ?? "stripe",
          direction: "inbound",
          accountType: "user",
          accountId: order.buyerUserId,
          amount: order.priceAmount,
          currency: "USD",
          entryType: "refund",
          metadata: {
            orderId,
            listingId: order.listingId,
            stripePaymentIntentId: order.providerPaymentReference,
            reason: "order_cancelled",
          },
        },
        {
          relatedOrderId: orderId,
          provider: order.paymentProvider ?? "stripe",
          direction: "outbound",
          accountType: "platform",
          accountId: PLATFORM_ACCOUNT_ID,
          amount: order.platformFee,
          currency: "USD",
          entryType: "refund",
          metadata: {
            orderId,
            stripePaymentIntentId: order.providerPaymentReference,
            reason: "order_cancelled_fee_reversal",
          },
        },
      ]);
    } else {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.cancel(order.providerPaymentReference);
      } catch (err) {
        console.error(`[orders] Failed to cancel Stripe PaymentIntent for order ${orderId}:`, err);
      }
    }
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
