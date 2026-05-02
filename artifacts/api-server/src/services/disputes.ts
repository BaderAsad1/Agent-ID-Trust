import { eq, and, desc, isNull, inArray } from "drizzle-orm";
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

  let paymentAction: "refunded" | "captured" | "split" | "skipped" = "skipped";

  // Trigger Stripe action when there's a payment intent on the order.
  if (order.providerPaymentReference) {
    const provider = order.paymentProvider ?? "stripe";

    if (params.resolution === "refund_buyer") {
      const refund = await refundProviderPayment(provider, order.providerPaymentReference);
      if (!refund.success) {
        logger.error({ orderId: order.id, err: refund.error }, "[disputes] refund failed");
        return { success: false, error: `REFUND_FAILED:${refund.error}` };
      }
      paymentAction = "refunded";
      await db.insert(paymentLedgerTable).values({
        relatedOrderId: order.id,
        provider,
        direction: "inbound",
        accountType: "user",
        accountId: order.buyerUserId,
        amount: order.priceAmount,
        currency: "USD",
        entryType: "refund",
        metadata: {
          orderId: order.id,
          listingId: order.listingId,
          stripePaymentIntentId: order.providerPaymentReference,
          stripeRefundId: refund.refundId ?? null,
          reason: "dispute_resolved_buyer_wins",
        },
      });
    } else if (params.resolution === "release_seller") {
      // If payment is in `requires_capture` state, capture it. If already
      // captured (e.g. instant-capture flow), this is a no-op error from Stripe
      // — treat as success.
      const capture = await captureProviderPayment(provider, order.providerPaymentReference);
      if (!capture.success && capture.error && !/already.captured/i.test(capture.error)) {
        logger.error({ orderId: order.id, err: capture.error }, "[disputes] capture failed");
        return { success: false, error: `CAPTURE_FAILED:${capture.error}` };
      }
      paymentAction = "captured";
    } else if (params.resolution === "split") {
      // Split: refund 50% to buyer, leave the rest to be captured/released to
      // seller. Operators can use adminNote to describe a different split.
      const fullCents = Math.round(parseFloat(order.priceAmount) * 100);
      const refundCents = Math.floor(fullCents / 2);
      const refund = await refundProviderPayment(provider, order.providerPaymentReference, refundCents);
      if (!refund.success) {
        logger.error({ orderId: order.id, err: refund.error }, "[disputes] split refund failed");
        return { success: false, error: `REFUND_FAILED:${refund.error}` };
      }
      paymentAction = "split";
      await db.insert(paymentLedgerTable).values({
        relatedOrderId: order.id,
        provider,
        direction: "inbound",
        accountType: "user",
        accountId: order.buyerUserId,
        amount: (refundCents / 100).toFixed(2),
        currency: "USD",
        entryType: "refund",
        metadata: {
          orderId: order.id,
          listingId: order.listingId,
          stripePaymentIntentId: order.providerPaymentReference,
          stripeRefundId: refund.refundId ?? null,
          reason: "dispute_resolved_split",
        },
      });
    }
  } else {
    logger.warn({ orderId: order.id }, "[disputes] no provider payment reference — payment action skipped");
  }

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
      .where(eq(marketplaceDisputesTable.id, dispute.id))
      .returning();
    updatedDispute = row;

    await tx
      .update(marketplaceOrdersTable)
      .set({ status: newOrderStatus, updatedAt: new Date() })
      .where(eq(marketplaceOrdersTable.id, order.id));
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
