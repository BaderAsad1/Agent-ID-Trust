import { eq, and, desc, isNull, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  marketplaceDisputesTable,
  marketplaceOrdersTable,
  marketplaceListingsTable,
  usersTable,
  paymentLedgerTable,
  type MarketplaceDispute,
} from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import {
  captureProviderPayment,
  refundProviderPayment,
} from "./payment-providers";
import {
  sendDisputeOpenedEmail,
  sendDisputeRespondedEmail,
  sendDisputeResolvedEmail,
} from "./email";

const PLATFORM_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";

export type DisputeResolution = "refund_buyer" | "release_seller" | "split";

interface OrderContext {
  id: string;
  buyerUserId: string;
  sellerUserId: string;
  listingId: string;
  status: string;
  priceAmount: string;
  platformFee: string | null;
  paymentProvider: string | null;
  providerPaymentReference: string | null;
}

async function getOrderContext(orderId: string): Promise<OrderContext | null> {
  const row = await db.query.marketplaceOrdersTable.findFirst({
    where: eq(marketplaceOrdersTable.id, orderId),
    columns: {
      id: true,
      buyerUserId: true,
      sellerUserId: true,
      listingId: true,
      status: true,
      priceAmount: true,
      platformFee: true,
      paymentProvider: true,
      providerPaymentReference: true,
    },
  });
  return row ?? null;
}

async function getListingTitle(listingId: string): Promise<string> {
  const l = await db.query.marketplaceListingsTable.findFirst({
    where: eq(marketplaceListingsTable.id, listingId),
    columns: { title: true },
  });
  return l?.title ?? "your order";
}

async function getEmailById(userId: string): Promise<string | null> {
  const u = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { email: true },
  });
  return u?.email ?? null;
}

/**
 * Open a new dispute on an order. Either party may open one. Sets order to
 * `disputed` and creates the dispute record. Notifies the counterparty by
 * email. Idempotent on per-order basis: if an open dispute exists, returns
 * ALREADY_DISPUTED.
 */
export async function openDispute(params: {
  orderId: string;
  userId: string;
  reason: string;
  description?: string;
  evidence?: string;
}): Promise<{ success: boolean; dispute?: MarketplaceDispute; error?: string }> {
  const order = await getOrderContext(params.orderId);
  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.buyerUserId !== params.userId && order.sellerUserId !== params.userId) {
    return { success: false, error: "FORBIDDEN" };
  }
  if (order.status === "disputed") {
    return { success: false, error: "ALREADY_DISPUTED" };
  }
  if (order.status === "cancelled" || order.status === "completed") {
    return { success: false, error: `INVALID_STATUS:${order.status}` };
  }

  const raisedBy: "buyer" | "seller" =
    order.buyerUserId === params.userId ? "buyer" : "seller";

  let inserted: MarketplaceDispute | null = null;
  await db.transaction(async (tx) => {
    await tx
      .update(marketplaceOrdersTable)
      .set({ status: "disputed", updatedAt: new Date() })
      .where(eq(marketplaceOrdersTable.id, params.orderId));

    const [row] = await tx
      .insert(marketplaceDisputesTable)
      .values({
        orderId: params.orderId,
        raisedByUserId: params.userId,
        reason: params.reason,
        description: params.description,
        evidence: params.evidence,
        status: "open",
      })
      .returning();
    inserted = row;
  });

  // Email the counterparty (best-effort, non-blocking on failure)
  try {
    const listingTitle = await getListingTitle(order.listingId);
    const counterpartyId = raisedBy === "buyer" ? order.sellerUserId : order.buyerUserId;
    const counterpartyEmail = await getEmailById(counterpartyId);
    if (counterpartyEmail) {
      await sendDisputeOpenedEmail(counterpartyEmail, {
        listingTitle,
        orderId: order.id,
        reason: params.reason,
        description: params.description,
        raisedBy,
      });
    }
  } catch (err) {
    logger.error({ err, orderId: order.id }, "[disputes] Failed to send opened email");
  }

  return { success: true, dispute: inserted ?? undefined };
}

/**
 * Counterparty (typically seller) posts a response on an open dispute. Stores
 * the response on the dispute row and notifies the dispute's raiser by email.
 */
export async function respondToDispute(params: {
  orderId: string;
  userId: string;
  response: string;
}): Promise<{ success: boolean; dispute?: MarketplaceDispute; error?: string }> {
  const order = await getOrderContext(params.orderId);
  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.buyerUserId !== params.userId && order.sellerUserId !== params.userId) {
    return { success: false, error: "FORBIDDEN" };
  }

  const dispute = await db.query.marketplaceDisputesTable.findFirst({
    where: eq(marketplaceDisputesTable.orderId, params.orderId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!dispute) return { success: false, error: "DISPUTE_NOT_FOUND" };
  if (dispute.status !== "open" && dispute.status !== "responded") {
    return { success: false, error: `DISPUTE_NOT_OPEN:${dispute.status}` };
  }
  // The responder must be the OTHER party (not the raiser)
  if (dispute.raisedByUserId === params.userId) {
    return { success: false, error: "CANNOT_RESPOND_TO_OWN_DISPUTE" };
  }

  const [updated] = await db
    .update(marketplaceDisputesTable)
    .set({
      sellerResponse: params.response,
      respondedAt: new Date(),
      status: "responded",
      updatedAt: new Date(),
    })
    .where(eq(marketplaceDisputesTable.id, dispute.id))
    .returning();

  // Email the raiser
  try {
    const listingTitle = await getListingTitle(order.listingId);
    const raiserEmail = await getEmailById(dispute.raisedByUserId);
    const responderRole: "buyer" | "seller" =
      order.buyerUserId === params.userId ? "buyer" : "seller";
    const snippet = params.response.length > 240
      ? params.response.slice(0, 240) + "…"
      : params.response;
    if (raiserEmail) {
      await sendDisputeRespondedEmail(raiserEmail, {
        listingTitle,
        orderId: order.id,
        responderRole,
        responseSnippet: snippet,
      });
    }
  } catch (err) {
    logger.error({ err, orderId: order.id }, "[disputes] Failed to send responded email");
  }

  return { success: true, dispute: updated };
}

/**
 * Operator-only: resolve a dispute. Triggers a Stripe refund or capture as
 * appropriate, updates the order + dispute rows, writes a ledger entry, and
 * emails both parties.
 */
export async function resolveDispute(params: {
  orderId: string;
  resolution: DisputeResolution;
  adminNote?: string;
  resolvedByUserId?: string;
}): Promise<{
  success: boolean;
  dispute?: MarketplaceDispute;
  paymentAction?: "refunded" | "captured" | "split" | "skipped";
  error?: string;
}> {
  const order = await getOrderContext(params.orderId);
  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.status !== "disputed") {
    return { success: false, error: `ORDER_NOT_DISPUTED:${order.status}` };
  }

  const dispute = await db.query.marketplaceDisputesTable.findFirst({
    where: eq(marketplaceDisputesTable.orderId, params.orderId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  if (!dispute) return { success: false, error: "DISPUTE_NOT_FOUND" };
  if (dispute.status === "resolved") {
    return { success: false, error: "DISPUTE_ALREADY_RESOLVED" };
  }

  const provider = order.paymentProvider ?? "stripe";
  const disputeId = dispute.id;
  // Stable per-dispute idempotency keys. Stripe will return the same refund or
  // capture object on retry instead of double-acting. Each resolution shape
  // gets its own key so a sequence of resolution attempts doesn't reuse a key
  // from a different operation.
  const refundIdempotencyKey = `dispute_refund_${disputeId}`;
  const splitRefundIdempotencyKey = `dispute_split_refund_${disputeId}`;
  const captureIdempotencyKey = `dispute_capture_${disputeId}`;

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1 (intent): atomically claim the dispute by flipping status from
  // open/responded → resolving in a single UPDATE. The first concurrent
  // operator wins; the loser sees zero rows and aborts before any Stripe
  // call. Inside the same transaction we insert the pending payment_ledger
  // row(s) for the chosen resolution shape so a crash before Stripe still
  // leaves a durable trace tied to the chosen idempotency key. (audit C1.)
  //
  // dispute.status is varchar(50) (no enum) so an intermediate "resolving"
  // value is safe without a schema migration.
  // ──────────────────────────────────────────────────────────────────────────
  type ResolveClaim =
    | { kind: "fresh"; refundLedgerId?: string }
    | { kind: "recover"; refundLedgerId?: string }
    | { kind: "lost" };

  const claim: ResolveClaim = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(marketplaceDisputesTable)
      .set({
        status: "resolving",
        resolution: params.resolution,
        adminNote: params.adminNote,
        resolvedByUserId: params.resolvedByUserId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(marketplaceDisputesTable.id, disputeId),
        inArray(marketplaceDisputesTable.status, ["open", "responded"]),
      ))
      .returning();

    if (!claimed) {
      // Recovery scenario: another caller (or a prior crashed attempt) is
      // already resolving this dispute. If the prior attempt got as far as
      // creating a pending refund ledger row for the SAME resolution shape,
      // we resume from there.
      const current = await tx.query.marketplaceDisputesTable.findFirst({
        where: eq(marketplaceDisputesTable.id, disputeId),
      });
      if (current?.status === "resolving" && current.resolution === params.resolution) {
        const pending = await tx.query.paymentLedgerTable.findFirst({
          where: and(
            eq(paymentLedgerTable.relatedOrderId, order.id),
            eq(paymentLedgerTable.entryType, "refund"),
            sql`(${paymentLedgerTable.metadata}->>'disputeId') = ${disputeId}`,
            sql`(${paymentLedgerTable.metadata}->>'intentStage') = 'pending_stripe_refund'`,
          ),
        });
        return { kind: "recover", refundLedgerId: pending?.id };
      }
      return { kind: "lost" };
    }

    // Fresh resolution — persist a pending refund ledger row when the
    // resolution involves money flowing back to the buyer. release_seller
    // does a capture only and produces no refund row, so we skip the insert.
    if (
      order.providerPaymentReference &&
      (params.resolution === "refund_buyer" || params.resolution === "split")
    ) {
      const isFull = params.resolution === "refund_buyer";
      const amountStr = isFull
        ? order.priceAmount
        : (Math.floor(Math.round(parseFloat(order.priceAmount) * 100) / 2) / 100).toFixed(2);
      const idemKey = isFull ? refundIdempotencyKey : splitRefundIdempotencyKey;
      const reason = isFull ? "dispute_resolved_buyer_wins" : "dispute_resolved_split";

      const [refundRow] = await tx
        .insert(paymentLedgerTable)
        .values({
          relatedOrderId: order.id,
          provider,
          direction: "inbound",
          accountType: "user",
          accountId: order.buyerUserId,
          amount: amountStr,
          currency: "USD",
          entryType: "refund",
          metadata: {
            orderId: order.id,
            disputeId,
            listingId: order.listingId,
            stripePaymentIntentId: order.providerPaymentReference,
            stripeRefundId: null,
            reason,
            refundIdempotencyKey: idemKey,
            intentStage: "pending_stripe_refund",
          },
        })
        .returning({ id: paymentLedgerTable.id });
      return { kind: "fresh", refundLedgerId: refundRow.id };
    }

    return { kind: "fresh" };
  });

  if (claim.kind === "lost") {
    return { success: false, error: "DISPUTE_ALREADY_RESOLVING" };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2 (Stripe): execute the chosen resolution with stable idempotency
  // keys so retries cannot double-refund or double-capture.
  // ──────────────────────────────────────────────────────────────────────────
  let paymentAction: "refunded" | "captured" | "split" | "skipped" = "skipped";
  let stripeRefundId: string | null = null;

  if (order.providerPaymentReference) {
    if (params.resolution === "refund_buyer") {
      const refund = await refundProviderPayment(
        provider,
        order.providerPaymentReference,
        undefined,
        { idempotencyKey: refundIdempotencyKey },
      );
      if (!refund.success) {
        logger.error({ orderId: order.id, disputeId, err: refund.error }, "[disputes] refund failed — dispute remains 'resolving' for retry");
        return { success: false, error: `REFUND_FAILED:${refund.error}` };
      }
      paymentAction = "refunded";
      stripeRefundId = refund.refundId ?? null;
    } else if (params.resolution === "release_seller") {
      // Capture is naturally idempotent on the same PaymentIntent, but pass a
      // stable key anyway so any infrastructure retry consults Stripe's idem
      // cache instead of issuing a fresh capture API call.
      const capture = await captureProviderPayment(
        provider,
        order.providerPaymentReference,
        { idempotencyKey: captureIdempotencyKey },
      );
      if (!capture.success && capture.error && !/already.captured/i.test(capture.error)) {
        logger.error({ orderId: order.id, disputeId, err: capture.error }, "[disputes] capture failed — dispute remains 'resolving' for retry");
        return { success: false, error: `CAPTURE_FAILED:${capture.error}` };
      }
      paymentAction = "captured";
    } else if (params.resolution === "split") {
      const fullCents = Math.round(parseFloat(order.priceAmount) * 100);
      const refundCents = Math.floor(fullCents / 2);
      const refund = await refundProviderPayment(
        provider,
        order.providerPaymentReference,
        refundCents,
        { idempotencyKey: splitRefundIdempotencyKey },
      );
      if (!refund.success) {
        logger.error({ orderId: order.id, disputeId, err: refund.error }, "[disputes] split refund failed — dispute remains 'resolving' for retry");
        return { success: false, error: `REFUND_FAILED:${refund.error}` };
      }
      paymentAction = "split";
      stripeRefundId = refund.refundId ?? null;
    }
  } else {
    logger.warn({ orderId: order.id, disputeId }, "[disputes] no provider payment reference — payment action skipped");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 3 (finalize): flip dispute to resolved, flip order to its terminal
  // status, and stamp the Stripe refund id onto the pending ledger row, all
  // in one transaction.
  // ──────────────────────────────────────────────────────────────────────────
  const newOrderStatus =
    params.resolution === "refund_buyer" ? "cancelled" : "completed";

  let updatedDispute: MarketplaceDispute | undefined;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(marketplaceDisputesTable)
      .set({
        status: "resolved",
        resolution: params.resolution,
        adminNote: params.adminNote,
        resolvedAt: new Date(),
        resolvedByUserId: params.resolvedByUserId,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceDisputesTable.id, disputeId))
      .returning();
    updatedDispute = row;

    await tx
      .update(marketplaceOrdersTable)
      .set({ status: newOrderStatus, updatedAt: new Date() })
      .where(eq(marketplaceOrdersTable.id, order.id));

    if (claim.refundLedgerId) {
      await tx
        .update(paymentLedgerTable)
        .set({
          metadata: sql`COALESCE(${paymentLedgerTable.metadata}, '{}'::jsonb) || ${JSON.stringify({
            stripeRefundId,
            intentStage: "finalized",
          })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(paymentLedgerTable.id, claim.refundLedgerId));
    }
  });

  // Notify both parties (best-effort)
  try {
    const listingTitle = await getListingTitle(order.listingId);
    const [buyerEmail, sellerEmail] = await Promise.all([
      getEmailById(order.buyerUserId),
      getEmailById(order.sellerUserId),
    ]);
    const sends: Promise<void>[] = [];
    if (buyerEmail) {
      sends.push(sendDisputeResolvedEmail(buyerEmail, {
        listingTitle,
        orderId: order.id,
        resolution: params.resolution,
        recipientRole: "buyer",
        adminNote: params.adminNote,
      }));
    }
    if (sellerEmail) {
      sends.push(sendDisputeResolvedEmail(sellerEmail, {
        listingTitle,
        orderId: order.id,
        resolution: params.resolution,
        recipientRole: "seller",
        adminNote: params.adminNote,
      }));
    }
    await Promise.all(sends);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "[disputes] Failed to send resolved emails");
  }

  return { success: true, dispute: updatedDispute, paymentAction };
}

/**
 * Get the most recent dispute for an order. Returns null if no dispute exists.
 * Caller is expected to enforce participant/admin authorisation.
 */
export async function getDisputeForOrder(orderId: string): Promise<MarketplaceDispute | null> {
  const row = await db.query.marketplaceDisputesTable.findFirst({
    where: eq(marketplaceDisputesTable.orderId, orderId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return row ?? null;
}

export interface AdminDisputeRow {
  dispute: MarketplaceDispute;
  order: {
    id: string;
    listingId: string;
    buyerUserId: string;
    sellerUserId: string;
    priceAmount: string;
    status: string;
  };
  listingTitle: string;
}

/**
 * List disputes for the operator dashboard. Defaults to open + responded.
 */
export async function listDisputesForAdmin(params: {
  statuses?: string[];
  limit?: number;
  offset?: number;
}): Promise<AdminDisputeRow[]> {
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;
  const statuses = params.statuses ?? ["open", "responded"];

  const rows = await db
    .select({
      dispute: marketplaceDisputesTable,
      order: {
        id: marketplaceOrdersTable.id,
        listingId: marketplaceOrdersTable.listingId,
        buyerUserId: marketplaceOrdersTable.buyerUserId,
        sellerUserId: marketplaceOrdersTable.sellerUserId,
        priceAmount: marketplaceOrdersTable.priceAmount,
        status: marketplaceOrdersTable.status,
      },
      listingTitle: marketplaceListingsTable.title,
    })
    .from(marketplaceDisputesTable)
    .innerJoin(
      marketplaceOrdersTable,
      eq(marketplaceDisputesTable.orderId, marketplaceOrdersTable.id),
    )
    .leftJoin(
      marketplaceListingsTable,
      eq(marketplaceOrdersTable.listingId, marketplaceListingsTable.id),
    )
    .where(inArray(marketplaceDisputesTable.status, statuses))
    .orderBy(desc(marketplaceDisputesTable.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    dispute: r.dispute,
    order: r.order,
    listingTitle: r.listingTitle ?? "(listing removed)",
  }));
}

// Re-exported helpers used in tests / route handlers
export { getOrderContext as _internal_getOrderContext };
// Mark unused-import lint quiet
void and; void isNull;
