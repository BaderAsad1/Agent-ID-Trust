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

  // Atomic claim FIRST: only one concurrent caller flips pending → confirmed.
  // The loser of the race aborts before any Stripe-side capture happens.
  // (See audit M6: previous implementation had no status guard on the UPDATE.)
  const [claimed] = await db
    .update(marketplaceOrdersTable)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(and(
      eq(marketplaceOrdersTable.id, orderId),
      eq(marketplaceOrdersTable.sellerUserId, sellerUserId),
      eq(marketplaceOrdersTable.status, "pending"),
    ))
    .returning();

  if (!claimed) {
    return { success: false, error: "ORDER_ALREADY_CONFIRMED" };
  }

  if (order.providerPaymentReference && !hasMilestones) {
    // Stable idempotency key: a retry by the same caller (or a recovery sweep)
    // hits the same Stripe call and Stripe returns the prior result instead of
    // double-capturing. The atomic claim above guarantees only one caller will
    // ever reach this point for the pending → confirmed transition.
    const captureResult = await captureProviderPayment(
      order.paymentProvider ?? "stripe",
      order.providerPaymentReference,
      { idempotencyKey: `order_capture_${orderId}` },
    );
    if (!captureResult.success) {
      logger.error({ err: captureResult.error, orderId }, "[orders] Failed to capture payment — rolling back confirm");
      // Roll back the claim so the seller can retry. Use a guarded UPDATE so we
      // do not clobber a downstream status transition.
      await db
        .update(marketplaceOrdersTable)
        .set({ status: "pending", updatedAt: new Date() })
        .where(and(
          eq(marketplaceOrdersTable.id, orderId),
          eq(marketplaceOrdersTable.status, "confirmed"),
        ));
      return { success: false, error: `PAYMENT_CAPTURE_FAILED:${captureResult.error}` };
    }
  } else if (hasMilestones) {
    logger.info({ orderId }, "[confirmOrder] Order has milestones — funds remain in escrow until milestone release");
  }

  return { success: true, order: claimed };
}

export async function completeOrder(
  orderId: string,
  buyerUserId: string,
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
      eq(marketplaceOrdersTable.buyerUserId, buyerUserId),
    ),
  });

  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (
    order.status !== "confirmed" &&
    order.status !== "in_progress" &&
    order.status !== "completed"
  ) {
    return { success: false, error: `INVALID_STATUS:${order.status}` };
  }
  // Note: status === "completed" is intentionally allowed through so that the
  // saga's intent-or-recover transaction below can detect a pending
  // payout_ledger row left by a prior crashed attempt and replay Stripe
  // (idempotently) + finalize. Without this, recovery would require operator
  // intervention. (Code-review feedback on task #279.)

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

  const paymentRef = order.providerPaymentReference ?? undefined;

  const sellerAgent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, order.agentId),
    columns: { stripeConnectAccountId: true, stripeConnectStatus: true },
  });

  const connectAccountId =
    sellerAgent?.stripeConnectStatus === "active"
      ? sellerAgent.stripeConnectAccountId ?? undefined
      : undefined;
  const hasActiveConnect = Boolean(connectAccountId);
  if (!isMilestoneOrder && order.status !== "completed" && (!hasActiveConnect || !paymentRef)) {
    logger.warn(
      { orderId, hasPaymentReference: Boolean(paymentRef), stripeConnectStatus: sellerAgent?.stripeConnectStatus },
      "[completeOrder] Seller payout is not ready; leaving order open for buyer acceptance retry",
    );
    return { success: false, error: "SELLER_PAYOUT_NOT_READY" };
  }

  const PLATFORM_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";
  const captureIdempotencyKey = `order_capture_${orderId}`;
  const transferIdempotencyKey = `order_transfer_${orderId}`;

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1 (intent): Atomic claim + persist pending ledger rows in one tx.
  //
  // The claim UPDATE only succeeds for the first concurrent caller; the loser
  // sees zero rows returned. We perform a recovery branch when the order is
  // already `completed` but the payout_ledger row is still `pending` — that
  // means a previous attempt crashed between the intent commit and the Stripe
  // call. In that case we replay Stripe (idempotent via the keys above) and
  // finalize the ledger row.
  //
  // Wrapping the order UPDATE + ledger inserts in a single transaction means
  // we cannot crash with money moved at Stripe but no audit trail in the
  // ledger (audit H8 — completeOrder ledger drift on crash).
  // ──────────────────────────────────────────────────────────────────────────
  type ClaimOutcome =
    | { kind: "fresh"; updated: MarketplaceOrder; payoutLedgerId: string }
    | { kind: "recover"; updated: MarketplaceOrder; payoutLedgerId: string }
    | { kind: "already" };

  const claim: ClaimOutcome = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(marketplaceOrdersTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(marketplaceOrdersTable.id, orderId),
        eq(marketplaceOrdersTable.buyerUserId, buyerUserId),
        inArray(marketplaceOrdersTable.status, ["confirmed", "in_progress"]),
      ))
      .returning();

    if (!updated) {
      // Recovery: order is already in a terminal state. If a prior attempt
      // committed the intent ledger row but never finalized it, replay.
      const current = await tx.query.marketplaceOrdersTable.findFirst({
        where: eq(marketplaceOrdersTable.id, orderId),
      });
      if (current?.status === "completed") {
        const pendingPayout = await tx.query.payoutLedgerTable.findFirst({
          where: and(
            eq(payoutLedgerTable.relatedOrderId, orderId),
            eq(payoutLedgerTable.status, "pending"),
          ),
        });
        if (pendingPayout) {
          return { kind: "recover", updated: current, payoutLedgerId: pendingPayout.id };
        }
      }
      return { kind: "already" };
    }

    await tx
      .update(marketplaceListingsTable)
      .set({
        totalHires: sql`${marketplaceListingsTable.totalHires} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListingsTable.id, order.listingId));

    // Persist the payout intent BEFORE moving any money. If we crash between
    // here and the Stripe transfer, on retry the recovery branch above
    // detects the pending row and replays Stripe (idempotent keys make that
    // safe).
    const [pendingPayout] = await tx
      .insert(payoutLedgerTable)
      .values({
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
          stripePaymentIntentId: paymentRef,
          stripeConnectAccountId: sellerAgent?.stripeConnectAccountId ?? null,
          captureIdempotencyKey,
          transferIdempotencyKey,
          isMilestoneOrder,
          intentStage: "pending_stripe_payout",
        },
      })
      .returning({ id: payoutLedgerTable.id });

    await tx.insert(paymentLedgerTable).values([
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
          payoutStatus: "pending",
          isMilestoneOrder,
          payoutLedgerId: pendingPayout.id,
        },
      },
    ]);

    return { kind: "fresh", updated, payoutLedgerId: pendingPayout.id };
  });

  if (claim.kind === "already") {
    // Order is already completed and the payout_ledger has been finalized
    // (no pending row found). This is a duplicate completion call from a
    // legitimate retry — return idempotent success rather than an error so
    // operator-facing retries don't surface as failures.
    const current = await db.query.marketplaceOrdersTable.findFirst({
      where: eq(marketplaceOrdersTable.id, orderId),
    });
    return {
      success: true,
      order: current,
      payoutStatus: "completed",
      payoutNote: "Order was already completed; no further action taken.",
    };
  }

  const updated = claim.updated;
  const payoutLedgerId = claim.payoutLedgerId;

  if (!isMilestoneOrder && (!hasActiveConnect || !paymentRef)) {
    logger.warn(
      { orderId, hasPaymentReference: Boolean(paymentRef), stripeConnectStatus: sellerAgent?.stripeConnectStatus },
      "[completeOrder] Pending payout cannot be recovered until the seller payout account is ready",
    );
    return { success: false, error: "SELLER_PAYOUT_NOT_READY" };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2 (Stripe): move money. All Stripe calls use stable idempotency keys
  // so retries cannot double-capture or double-transfer.
  // ──────────────────────────────────────────────────────────────────────────
  let payoutStatus: "pending_manual_payout" | "processing" | "completed" = "pending_manual_payout";
  let stripeTransferId: string | undefined;

  if (hasActiveConnect && paymentRef && !isMilestoneOrder) {
    try {
      const stripe = getStripe();
      const sellerPayoutCents = Math.round(parseFloat(String(order.sellerPayout)) * 100);

      const pi = await stripe.paymentIntents.retrieve(paymentRef);
      if (pi.status === "requires_capture") {
        await stripe.paymentIntents.capture(
          paymentRef,
          {},
          { idempotencyKey: captureIdempotencyKey },
        );

        const transfer = await stripe.transfers.create(
          {
            amount: sellerPayoutCents,
            currency: "usd",
            destination: connectAccountId!,
            metadata: { orderId, listingId: order.listingId },
          },
          { idempotencyKey: transferIdempotencyKey },
        );
        stripeTransferId = transfer.id;
        payoutStatus = "completed";
        logger.info({ orderId, agentId: order.agentId, transferId: transfer.id }, "[completeOrder] Stripe Connect payout executed via PI capture + transfer");
      } else if (pi.status === "succeeded") {
        const transfer = await stripe.transfers.create(
          {
            amount: sellerPayoutCents,
            currency: "usd",
            destination: connectAccountId!,
            metadata: { orderId, listingId: order.listingId },
          },
          { idempotencyKey: transferIdempotencyKey },
        );
        stripeTransferId = transfer.id;
        payoutStatus = "completed";
        logger.info({ orderId, transferId: transfer.id }, "[completeOrder] Stripe Connect transfer executed");
      } else {
        logger.error({ orderId, paymentIntentStatus: pi.status }, "[completeOrder] PaymentIntent is not ready for payout");
        return { success: false, error: `PAYOUT_FAILED_RETRYABLE:PAYMENT_INTENT_${pi.status.toUpperCase()}` };
      }
    } catch (payoutErr) {
      logger.error(
        { orderId, error: payoutErr instanceof Error ? payoutErr.message : String(payoutErr) },
        "[completeOrder] Stripe Connect payout failed — pending payout intent remains retryable",
      );
      return { success: false, error: "PAYOUT_FAILED_RETRYABLE" };
    }
  } else if (isMilestoneOrder) {
    payoutStatus = "completed";
    logger.info({ orderId }, "[completeOrder] Milestone-based order — no order-level PI capture; milestones manage their own Stripe escrow");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 3 (finalize): record the actual Stripe IDs onto the pending ledger
  // row. If we crash before this, the row remains `pending` and the next
  // retry will replay Stripe (idempotently) and finalize.
  // ──────────────────────────────────────────────────────────────────────────
  await db
    .update(payoutLedgerTable)
    .set({
      status: payoutStatus,
      metadata: sql`COALESCE(${payoutLedgerTable.metadata}, '{}'::jsonb) || ${JSON.stringify({
        stripeTransferId: stripeTransferId ?? null,
        payoutStatus,
        intentStage: "finalized",
        ...(payoutStatus === "pending_manual_payout" && {
          note: "Stripe Connect seller payout — requires manual processing (agent has no active Connect account or transfer failed)",
        }),
      })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(payoutLedgerTable.id, payoutLedgerId));

  await db
    .update(paymentLedgerTable)
    .set({
      metadata: sql`COALESCE(${paymentLedgerTable.metadata}, '{}'::jsonb) || ${JSON.stringify({
        stripeTransferId: stripeTransferId ?? null,
        payoutStatus,
      })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(paymentLedgerTable.relatedOrderId, orderId),
      eq(paymentLedgerTable.entryType, "seller_payout"),
    ));

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
  if (order.status === "completed") {
    // Completed orders cannot be cancelled here — they require a separate
    // refund flow that reverses the seller payout. (Disputes handle that.)
    return { success: false, error: `INVALID_STATUS:${order.status}` };
  }
  // Note: status === "cancelled" is intentionally allowed through. The
  // captured-payment saga below contains a recovery branch that detects a
  // pending refund payment_ledger row left by a prior crashed attempt and
  // replays Stripe (idempotently) to finalize. Without this, recovery would
  // require operator intervention. (Code-review feedback on task #279.)

  const capturedStatuses = ["confirmed", "in_progress"];
  const isCaptured = capturedStatuses.includes(order.status);

  // For an already-cancelled order, decide whether to route into the
  // captured-payment saga's recovery branch or return idempotent success.
  //
  // We CANNOT use `isCaptured` here — it is computed from order.status, which
  // is now "cancelled" for both fully-finalized cancellations AND for prior
  // attempts that crashed AFTER flipping the status but BEFORE refunding.
  // The durable signal is the payment_ledger: if a refund row tagged with
  // intentStage='pending_stripe_refund' exists, a prior attempt committed
  // intent rows but never reached Stripe — replay through the saga.
  let isCapturedCancelRecovery = false;
  if (order.status === "cancelled") {
    if (!order.providerPaymentReference) {
      // No captured payment to refund — idempotent success.
      return { success: true, order };
    }
    const pendingRefund = await db.query.paymentLedgerTable.findFirst({
      where: and(
        eq(paymentLedgerTable.relatedOrderId, orderId),
        eq(paymentLedgerTable.entryType, "refund"),
      ),
    });
    const stage = (pendingRefund?.metadata as Record<string, unknown> | undefined)
      ?.intentStage;
    if (!pendingRefund || stage !== "pending_stripe_refund") {
      // Either no refund intent was ever committed (uncaptured PI flow) or
      // the prior attempt fully finalized. Idempotent success.
      return { success: true, order };
    }
    // Pending refund intent exists — route DIRECTLY to the captured-payment
    // saga below (skipping the uncaptured/no-ref branches that would
    // otherwise reject because order.status is already 'cancelled'). The
    // saga's in-tx claim block will land in its "recover" branch and replay
    // Stripe with stable idempotency keys, then finalize the ledger rows.
    isCapturedCancelRecovery = true;
  }

  const PLATFORM_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";
  const refundIdempotencyKey = `order_refund_${orderId}`;
  const reversalIdempotencyKey = `order_reversal_${orderId}`;

  // Uncaptured payment-intent path: just cancel the PI atomically. No money has
  // moved yet, so the saga pattern below is unnecessary.
  // (Skipped when isCapturedCancelRecovery is set — that means the order is
  // already 'cancelled' with a pending captured-payment refund, and must go
  // straight to the captured-payment saga's recovery branch below.)
  if (!isCapturedCancelRecovery && order.providerPaymentReference && !isCaptured) {
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

    try {
      const stripe = getStripe();
      await stripe.paymentIntents.cancel(order.providerPaymentReference);
    } catch (err) {
      logger.error({ err, orderId }, "[orders] Failed to cancel Stripe PaymentIntent");
    }

    return { success: true, order: updated };
  }

  // No payment reference at all — just flip the status atomically.
  if (!order.providerPaymentReference) {
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

  // ──────────────────────────────────────────────────────────────────────────
  // Captured-payment cancellation — saga pattern (audit C2):
  //
  //   STEP 1 (intent): atomic claim flips status confirmed/in_progress →
  //     cancelled and inserts pending refund ledger rows in ONE transaction.
  //     Concurrent callers contend on this UPDATE; only one wins, so Stripe
  //     can never be hit twice.
  //   STEP 2 (Stripe): refund + connect transfer reversal, both keyed by
  //     stable idempotency strings, so any retry returns the prior result.
  //   STEP 3 (finalize): write the actual Stripe IDs onto the pending ledger
  //     rows.
  //
  // Recovery: if a previous attempt committed the intent but crashed before
  // Stripe, the order is already cancelled and the pending refund row exists.
  // We detect that, replay Stripe (idempotent), and finalize.
  // ──────────────────────────────────────────────────────────────────────────
  type CancelClaim =
    | {
      kind: "fresh" | "recover";
      updated: MarketplaceOrder;
      refundLedgerId: string;
      feeReversalLedgerId: string;
    }
    | { kind: "already" };

  const claim: CancelClaim = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(marketplaceOrdersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(marketplaceOrdersTable.id, orderId),
        sql`${marketplaceOrdersTable.status} NOT IN ('completed', 'cancelled')`,
      ))
      .returning();

    if (!updated) {
      // Recovery path: order already cancelled. If a pending refund ledger
      // row exists, replay Stripe and finalize it.
      const current = await tx.query.marketplaceOrdersTable.findFirst({
        where: eq(marketplaceOrdersTable.id, orderId),
      });
      if (current?.status === "cancelled") {
        const pendingRows = await tx
          .select()
          .from(paymentLedgerTable)
          .where(and(
            eq(paymentLedgerTable.relatedOrderId, orderId),
            eq(paymentLedgerTable.entryType, "refund"),
            sql`(${paymentLedgerTable.metadata}->>'intentStage') = 'pending_stripe_refund'`,
          ));
        const refundRow = pendingRows.find((r) =>
          (r.metadata as Record<string, unknown>)?.reason === "order_cancelled");
        const feeRow = pendingRows.find((r) =>
          (r.metadata as Record<string, unknown>)?.reason === "order_cancelled_fee_reversal");
        if (refundRow && feeRow) {
          return {
            kind: "recover",
            updated: current,
            refundLedgerId: refundRow.id,
            feeReversalLedgerId: feeRow.id,
          };
        }
      }
      return { kind: "already" };
    }

    const inserted = await tx
      .insert(paymentLedgerTable)
      .values([
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
            stripeRefundId: null,
            reason: "order_cancelled",
            refundIdempotencyKey,
            reversalIdempotencyKey,
            intentStage: "pending_stripe_refund",
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
            stripeRefundId: null,
            reason: "order_cancelled_fee_reversal",
            refundIdempotencyKey,
            intentStage: "pending_stripe_refund",
          },
        },
      ])
      .returning({ id: paymentLedgerTable.id, metadata: paymentLedgerTable.metadata });

    const refundRow = inserted.find((r) =>
      (r.metadata as Record<string, unknown>)?.reason === "order_cancelled")!;
    const feeRow = inserted.find((r) =>
      (r.metadata as Record<string, unknown>)?.reason === "order_cancelled_fee_reversal")!;

    return {
      kind: "fresh",
      updated,
      refundLedgerId: refundRow.id,
      feeReversalLedgerId: feeRow.id,
    };
  });

  if (claim.kind === "already") {
    // Order is already cancelled and the refund payment_ledger rows have been
    // finalized (no pending row found). This is a duplicate cancel call from
    // a legitimate retry — return idempotent success rather than an error.
    const current = await db.query.marketplaceOrdersTable.findFirst({
      where: eq(marketplaceOrdersTable.id, orderId),
    });
    if (current?.status === "cancelled") {
      return { success: true, order: current };
    }
    return { success: false, error: "ORDER_ALREADY_COMPLETED_OR_CANCELLED" };
  }

  const updated = claim.updated;

  // Step 2a: Stripe refund (idempotent).
  const refundResult = await refundProviderPayment(
    order.paymentProvider ?? "stripe",
    order.providerPaymentReference,
    undefined,
    { idempotencyKey: refundIdempotencyKey },
  );
  if (!refundResult.success) {
    logger.error({ err: refundResult.error, orderId }, "[orders] Failed to refund payment — order remains cancelled with pending refund ledger row for retry");
    return { success: false, error: `REFUND_FAILED:${refundResult.error}` };
  }

  // Step 2b: reverse any Stripe Connect transfer that completeOrder may have
  // pushed to the seller. Idempotent via reversalIdempotencyKey.
  let reversedTransferId: string | undefined;
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
      await stripe.transfers.createReversal(transferId, {}, { idempotencyKey: reversalIdempotencyKey });
      reversedTransferId = transferId;
      logger.info({ orderId, transferId }, "[cancelOrder] Stripe Connect transfer reversed");
    }
  } catch (reversalErr) {
    logger.error(
      { orderId, error: reversalErr instanceof Error ? reversalErr.message : String(reversalErr) },
      "[cancelOrder] Failed to reverse Stripe Connect transfer — manual reversal needed",
    );
  }

  // Step 3: finalize the pending refund ledger rows with actual Stripe IDs.
  const finalizeMetadata = JSON.stringify({
    stripeRefundId: refundResult.refundId ?? null,
    reversedTransferId: reversedTransferId ?? null,
    intentStage: "finalized",
  });
  await db
    .update(paymentLedgerTable)
    .set({
      metadata: sql`COALESCE(${paymentLedgerTable.metadata}, '{}'::jsonb) || ${finalizeMetadata}::jsonb`,
      updatedAt: new Date(),
    })
    .where(inArray(paymentLedgerTable.id, [claim.refundLedgerId, claim.feeReversalLedgerId]));

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
