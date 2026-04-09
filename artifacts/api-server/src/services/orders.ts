import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { logger } from "../middlewares/request-logger";
import { db } from "@workspace/db";
import {
  marketplaceOrdersTable,
  marketplaceListingsTable,
  marketplaceMilestonesTable,
  agentsTable,
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
  selectedPackage?: string;
  orchestratorAgentId?: string;
  parentOrderId?: string;
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

  let priceAmount = Number(listing.priceAmount ?? 0);

  if (input.selectedPackage && listing.packages && Array.isArray(listing.packages)) {
    const packages = listing.packages as Array<{ name: string; priceUsdc: string; deliveryDays: number }>;
    const selectedPkg = packages.find(
      (p) => p.name.toLowerCase() === input.selectedPackage!.toLowerCase(),
    );
    if (!selectedPkg) {
      return { success: false, error: "PACKAGE_NOT_FOUND" };
    }
    priceAmount = Number(selectedPkg.priceUsdc);
  }

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
    logger.error({ err }, "[orders] Failed to create Stripe PaymentIntent");;
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
      escrowPaymentIntentId: stripePaymentIntentId,
      selectedPackage: input.selectedPackage,
      orchestratorAgentId: input.orchestratorAgentId,
      parentOrderId: input.parentOrderId,
      paymentRail: "stripe",
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
      logger.error({ err }, "[orders] Failed to update PaymentIntent metadata");;
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

  const hasMilestones = (await db.query.marketplaceMilestonesTable.findFirst({
    where: eq(marketplaceMilestonesTable.orderId, orderId),
    columns: { id: true },
  })) !== undefined;

  if (!hasMilestones && order.providerPaymentReference) {
    try {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(order.providerPaymentReference);
      if (pi.status !== "requires_capture") {
        return { success: false, error: `PAYMENT_NOT_AUTHORIZED:${pi.status}` };
      }
    } catch (err) {
      logger.error({ err, orderId }, "[orders] Failed to verify PaymentIntent");;
      return { success: false, error: "PAYMENT_VERIFICATION_FAILED" };
    }
  } else if (hasMilestones) {
    logger.info({ orderId }, "[confirmPayment] Milestone order — skipping order-level PI validation; milestones hold their own escrow");
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

  const milestones = await db.query.marketplaceMilestonesTable.findMany({
    where: eq(marketplaceMilestonesTable.orderId, orderId),
    columns: { id: true },
  });
  const hasMilestones = milestones.length > 0;

  if (order.providerPaymentReference && !hasMilestones) {
    const captureResult = await captureProviderPayment(
      order.paymentProvider ?? "stripe",
      order.providerPaymentReference,
    );
    if (!captureResult.success) {
      logger.error({ err: captureResult.error, orderId }, "[orders] Failed to capture payment");;
      return { success: false, error: `PAYMENT_CAPTURE_FAILED:${captureResult.error}` };
    }
  } else if (hasMilestones) {
    logger.info({ orderId }, "[confirmOrder] Order has milestones — funds remain in escrow until milestone release");
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

  const allMilestones = await db.query.marketplaceMilestonesTable.findMany({
    where: eq(marketplaceMilestonesTable.orderId, orderId),
    columns: { id: true, title: true, status: true },
  });

  const isMilestoneOrder = allMilestones.length > 0;
  const unreleasedMilestones = allMilestones.filter((m) => m.status !== "released");

  if (isMilestoneOrder && unreleasedMilestones.length > 0) {
    const unreleasedTitles = unreleasedMilestones.map((m) => `"${m.title}" (${m.status})`).join(", ");
    logger.warn(
      { orderId, unreleased: unreleasedMilestones.map((m) => m.id) },
      "[completeOrder] Blocked: unreleased milestones exist",
    );
    return {
      success: false,
      error: `MILESTONES_NOT_RELEASED: ${unreleasedMilestones.length} milestone(s) must be released before completing the order: ${unreleasedTitles}`,
    };
  }

  // Atomic claim: only the first concurrent caller succeeds; others get ORDER_ALREADY_COMPLETED.
  const [updated] = await db
    .update(marketplaceOrdersTable)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(marketplaceOrdersTable.id, orderId),
      eq(marketplaceOrdersTable.sellerUserId, sellerUserId),
      inArray(marketplaceOrdersTable.status, ["confirmed", "in_progress"]),
    ))
    .returning();

  if (!updated) {
    return { success: false, error: "ORDER_ALREADY_COMPLETED" };
  }

  await db
    .update(marketplaceListingsTable)
    .set({
      totalHires: sql`${marketplaceListingsTable.totalHires} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceListingsTable.id, order.listingId));

  const paymentRef = order.providerPaymentReference ?? undefined;

  const sellerAgent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, order.agentId),
    columns: { stripeConnectAccountId: true, stripeConnectStatus: true },
  });

  let payoutStatus: "pending_manual_payout" | "processing" | "completed" = "pending_manual_payout";
  let stripeTransferId: string | undefined;

  const hasActiveConnect =
    sellerAgent?.stripeConnectAccountId && sellerAgent.stripeConnectStatus === "active";

  if (hasActiveConnect && paymentRef && !isMilestoneOrder) {
    try {
      const stripe = getStripe();
      const sellerPayoutCents = Math.round(parseFloat(String(order.sellerPayout)) * 100);

      const pi = await stripe.paymentIntents.retrieve(paymentRef);
      if (pi.status === "requires_capture") {
        await stripe.paymentIntents.capture(
          paymentRef,
          {},
          { idempotencyKey: `order_capture_${orderId}` },
        );

        const transfer = await stripe.transfers.create(
          {
            amount: sellerPayoutCents,
            currency: "usd",
            destination: sellerAgent.stripeConnectAccountId!,
            metadata: { orderId, listingId: order.listingId },
          },
          { idempotencyKey: `order_transfer_${orderId}` },
        );
        stripeTransferId = transfer.id;
        payoutStatus = "completed";
        logger.info({ orderId, agentId: order.agentId, transferId: transfer.id }, "[completeOrder] Stripe Connect payout executed via PI capture + transfer");
      } else if (pi.status === "succeeded") {
        const transfer = await stripe.transfers.create(
          {
            amount: sellerPayoutCents,
            currency: "usd",
            destination: sellerAgent.stripeConnectAccountId!,
            metadata: { orderId, listingId: order.listingId },
          },
          { idempotencyKey: `order_transfer_${orderId}` },
        );
        stripeTransferId = transfer.id;
        payoutStatus = "completed";
        logger.info({ orderId, transferId: transfer.id }, "[completeOrder] Stripe Connect transfer executed");
      }
    } catch (payoutErr) {
      logger.error(
        { orderId, error: payoutErr instanceof Error ? payoutErr.message : String(payoutErr) },
        "[completeOrder] Stripe Connect payout failed — falling back to manual payout",
      );
      payoutStatus = "pending_manual_payout";
    }
  } else if (isMilestoneOrder) {
    logger.info({ orderId }, "[completeOrder] Milestone-based order — no order-level PI capture; milestones manage their own Stripe escrow");
  }

  await db.insert(payoutLedgerTable).values({
    relatedOrderId: orderId,
    sellerUserId: order.sellerUserId,
    provider: order.paymentProvider ?? "stripe",
    amount: order.sellerPayout,
    currency: "USD",
    status: payoutStatus,
    metadata: {
      orderId,
      listingId: order.listingId,
      totalPrice: order.priceAmount,
      platformFee: order.platformFee,
      stripePaymentIntentId: paymentRef,
      stripeTransferId: stripeTransferId ?? null,
      stripeConnectAccountId: sellerAgent?.stripeConnectAccountId ?? null,
      ...(payoutStatus === "pending_manual_payout" && {
        note: "Stripe Connect seller payout — requires manual processing (agent has no active Connect account)",
      }),
    },
  });

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
        stripeTransferId: stripeTransferId ?? null,
        payoutStatus,
        isMilestoneOrder,
      },
    },
  ]);

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

  if (payoutStatus !== "completed") {
    logger.warn({ orderId }, "[orders] PAYOUT REQUIRED — manual settlement needed in Stripe Dashboard");;
  }

  const payoutNote = payoutStatus === "completed"
    ? `Stripe Connect transfer executed to seller account ${sellerAgent?.stripeConnectAccountId ?? "unknown"} (transfer ID: ${stripeTransferId ?? "unknown"}).`
    : isMilestoneOrder
      ? "Milestone order — each milestone manages its own escrow release and payout."
      : "Seller payout requires manual settlement. Stripe Connect automated payouts are not yet implemented. Funds are held and will be disbursed manually by the platform operator.";

  return {
    success: true,
    order: updated,
    payoutStatus,
    payoutNote,
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
        logger.error({ err: refundResult.error, orderId }, "[orders] Failed to refund payment");;
        return { success: false, error: `REFUND_FAILED:${refundResult.error}` };
      }

      const PLATFORM_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";
      // Reverse any Stripe Connect transfer to seller before recording ledger entries
      try {
        const existingPayout = await db.query.payoutLedgerTable.findFirst({
          where: and(
            eq(payoutLedgerTable.relatedOrderId, orderId),
            eq(payoutLedgerTable.status, "completed"),
          ),
        });
        const transferId = (existingPayout?.metadata as Record<string, unknown>)?.stripeTransferId as string | undefined;
        if (transferId) {
          const stripe = getStripe();
          await stripe.transfers.createReversal(transferId, {}, { idempotencyKey: `order_reversal_${orderId}` });
          logger.info({ orderId, transferId }, "[cancelOrder] Stripe Connect transfer reversed");
        }
      } catch (reversalErr) {
        logger.error(
          { orderId, error: reversalErr instanceof Error ? reversalErr.message : String(reversalErr) },
          "[cancelOrder] Failed to reverse Stripe Connect transfer — manual reversal needed",
        );
      }

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
            stripeRefundId: refundResult.refundId ?? null,
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
            stripeRefundId: refundResult.refundId ?? null,
            reason: "order_cancelled_fee_reversal",
          },
        },
      ]);
    } else {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.cancel(order.providerPaymentReference);
      } catch (err) {
        logger.error({ err, orderId }, "[orders] Failed to cancel Stripe PaymentIntent");;
      }
    }
  }

  const [updated] = await db
    .update(marketplaceOrdersTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(
      eq(marketplaceOrdersTable.id, orderId),
      sql`${marketplaceOrdersTable.status} NOT IN ('completed', 'cancelled')`,
    ))
    .returning();

  if (!updated) {
    return { success: false, error: "ORDER_ALREADY_COMPLETED_OR_CANCELLED" };
  }

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
