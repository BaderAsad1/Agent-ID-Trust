import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  marketplaceMilestonesTable,
  marketplaceOrdersTable,
  marketplaceDisputesTable,
  agentsTable,
  payoutLedgerTable,
  type MarketplaceMilestone,
} from "@workspace/db/schema";
import { getStripe } from "./stripe-client";
import { logger } from "../middlewares/request-logger";

export interface CreateMilestoneInput {
  title: string;
  description?: string;
  amount: string;
  dueAt?: Date;
  sortOrder?: number;
}

export interface CreateMilestoneResult {
  milestone: MarketplaceMilestone;
  clientSecret?: string | null;
}

export async function createMilestones(
  orderId: string,
  milestones: CreateMilestoneInput[],
): Promise<CreateMilestoneResult[]> {
  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: eq(marketplaceOrdersTable.id, orderId),
    columns: { buyerUserId: true, sellerUserId: true, listingId: true, escrowPaymentIntentId: true, paymentRail: true },
  });

  if (!order) throw new Error("ORDER_NOT_FOUND");

  const createdPIs: Array<{ id: string; clientSecret: string | null }> = [];

  try {
    const stripe = getStripe();

    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      const amountCents = Math.round(parseFloat(m.amount) * 100);
      const pi = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        capture_method: "manual",
        metadata: {
          orderId,
          milestoneTitle: m.title,
          milestoneIndex: String(m.sortOrder ?? i),
          buyerUserId: order.buyerUserId,
          sellerUserId: order.sellerUserId,
          listingId: order.listingId,
        },
      });
      createdPIs.push({ id: pi.id, clientSecret: pi.client_secret ?? null });
    }

    if (order.escrowPaymentIntentId && order.paymentRail === "stripe") {
      try {
        await stripe.paymentIntents.cancel(order.escrowPaymentIntentId);
        logger.info({ orderId, piId: order.escrowPaymentIntentId }, "[milestone] Cancelled order-level PI after creating per-milestone PIs");
      } catch (cancelErr) {
        logger.warn(
          { orderId, piId: order.escrowPaymentIntentId, error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr) },
          "[milestone] Failed to cancel order-level PI — may result in duplicate hold",
        );
      }
    }
  } catch (err) {
    for (const pi of createdPIs) {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.cancel(pi.id);
      } catch (_) { /* best-effort cleanup */ }
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`MILESTONE_PI_CREATION_FAILED: ${msg}`);
  }

  const created: CreateMilestoneResult[] = [];

  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    const piData = createdPIs[i];

    const [row] = await db
      .insert(marketplaceMilestonesTable)
      .values({
        orderId,
        title: m.title,
        description: m.description,
        amount: m.amount,
        dueAt: m.dueAt,
        sortOrder: String(m.sortOrder ?? i),
        status: "pending",
        stripePaymentIntentId: piData.id,
      })
      .returning();

    created.push({ milestone: row, clientSecret: piData.clientSecret });
  }

  return created;
}

export async function getMilestonesByOrder(
  orderId: string,
): Promise<MarketplaceMilestone[]> {
  return db.query.marketplaceMilestonesTable.findMany({
    where: eq(marketplaceMilestonesTable.orderId, orderId),
  });
}

export async function markMilestoneComplete(
  milestoneId: string,
  sellerUserId: string,
): Promise<{ success: boolean; milestone?: MarketplaceMilestone; error?: string }> {
  const milestone = await db.query.marketplaceMilestonesTable.findFirst({
    where: eq(marketplaceMilestonesTable.id, milestoneId),
  });

  if (!milestone) return { success: false, error: "MILESTONE_NOT_FOUND" };

  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: eq(marketplaceOrdersTable.id, milestone.orderId),
    columns: { sellerUserId: true, status: true },
  });

  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.sellerUserId !== sellerUserId) return { success: false, error: "FORBIDDEN" };
  if (milestone.status !== "pending" && milestone.status !== "in_progress") {
    return { success: false, error: "MILESTONE_ALREADY_COMPLETED" };
  }

  const [updated] = await db
    .update(marketplaceMilestonesTable)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(marketplaceMilestonesTable.id, milestoneId))
    .returning();

  return { success: true, milestone: updated };
}

export async function releaseMilestoneEscrow(
  milestoneId: string,
  buyerUserId: string,
): Promise<{ success: boolean; milestone?: MarketplaceMilestone; capturedAmount?: string; error?: string }> {
  const milestone = await db.query.marketplaceMilestonesTable.findFirst({
    where: eq(marketplaceMilestonesTable.id, milestoneId),
  });

  if (!milestone) return { success: false, error: "MILESTONE_NOT_FOUND" };
  if (milestone.status === "released") {
    return { success: false, error: "MILESTONE_ALREADY_RELEASED" };
  }
  if (milestone.status !== "completed") {
    return { success: false, error: `MILESTONE_NOT_COMPLETED: current status is '${milestone.status}'. Milestone must be marked completed by seller before buyer can release escrow.` };
  }

  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: eq(marketplaceOrdersTable.id, milestone.orderId),
  });

  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.buyerUserId !== buyerUserId) return { success: false, error: "FORBIDDEN" };

  const milestoneAmountCents = Math.round(parseFloat(milestone.amount) * 100);
  let capturedAmountCents = milestoneAmountCents;

  if (!milestone.stripePaymentIntentId) {
    return {
      success: false,
      error: "NO_ESCROW_INSTRUMENT: milestone has no Stripe PaymentIntent — cannot release without confirmed payment hold",
    };
  }

  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(milestone.stripePaymentIntentId);

    if (pi.status === "requires_capture") {
      await stripe.paymentIntents.capture(
        milestone.stripePaymentIntentId,
        {},
        { idempotencyKey: `milestone_capture_${milestoneId}` },
      );
      logger.info(
        { milestoneId, piId: milestone.stripePaymentIntentId, amountCents: milestoneAmountCents },
        "[milestone] Per-milestone PaymentIntent captured successfully",
      );
    } else if (pi.status === "succeeded") {
      logger.warn(
        { milestoneId, piId: milestone.stripePaymentIntentId },
        "[milestone] PI already captured — idempotent release, marking as released",
      );
      capturedAmountCents = pi.amount_received;
    } else {
      return {
        success: false,
        error: `PAYMENT_INTENT_INVALID_STATE: milestone PI status is '${pi.status}'. Buyer must authorize payment before milestone can be released.`,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ milestoneId, orderId: order.id, error: msg }, "[milestone] Stripe capture failed");
    return { success: false, error: `STRIPE_CAPTURE_FAILED: ${msg}` };
  }

  const capturedAmount = (capturedAmountCents / 100).toFixed(2);
  const newReleasedAmount = (
    parseFloat(String(order.releasedAmount ?? "0")) + parseFloat(capturedAmount)
  ).toFixed(2);

  let stripeTransferId: string | null = null;
  let milestonePayoutStatus: "pending_manual_payout" | "completed" = "pending_manual_payout";

  if (order.agentId) {
    try {
      const sellerAgent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, order.agentId),
        columns: { stripeConnectAccountId: true, stripeConnectStatus: true },
      });

      if (sellerAgent?.stripeConnectAccountId && sellerAgent.stripeConnectStatus === "active") {
        const stripe = getStripe();
        const platformFeeRate = 0.10;
        const sellerPayout = Math.round(capturedAmountCents * (1 - platformFeeRate));
        const transfer = await stripe.transfers.create(
          {
            amount: sellerPayout,
            currency: "usd",
            destination: sellerAgent.stripeConnectAccountId,
            metadata: {
              orderId: order.id,
              milestoneId,
              milestoneAmount: capturedAmount,
            },
          },
          { idempotencyKey: `milestone_transfer_${milestoneId}` },
        );
        stripeTransferId = transfer.id;
        milestonePayoutStatus = "completed";
        logger.info(
          { milestoneId, orderId: order.id, transferId: transfer.id, amount: sellerPayout },
          "[milestone] Stripe Connect transfer executed for milestone release",
        );
      }
    } catch (payoutErr) {
      logger.error(
        { milestoneId, orderId: order.id, error: payoutErr instanceof Error ? payoutErr.message : String(payoutErr) },
        "[milestone] Stripe Connect transfer failed — payout needs manual processing",
      );
    }
  }

  // Atomic claim inside the transaction: only the first concurrent caller succeeds.
  // The milestone update uses WHERE status = 'completed' as the gate; if another call
  // already flipped it to 'released', zero rows are returned and we abort.
  let updated: MarketplaceMilestone;
  try {
    updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(marketplaceMilestonesTable)
        .set({
          status: "released",
          capturedAmount,
          approvedAt: new Date(),
          releasedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(marketplaceMilestonesTable.id, milestoneId),
          eq(marketplaceMilestonesTable.status, "completed"),
        ))
        .returning();

      if (rows.length === 0) {
        throw new Error("MILESTONE_ALREADY_RELEASED");
      }

      await tx
        .update(marketplaceOrdersTable)
        .set({ releasedAmount: newReleasedAmount, updatedAt: new Date() })
        .where(eq(marketplaceOrdersTable.id, order.id));

      await tx.insert(payoutLedgerTable).values({
        relatedOrderId: order.id,
        sellerUserId: order.sellerUserId,
        provider: order.paymentProvider ?? "stripe",
        amount: capturedAmount,
        currency: "USD",
        status: milestonePayoutStatus,
        metadata: {
          milestoneId,
          milestoneAmount: capturedAmount,
          stripePaymentIntentId: milestone.stripePaymentIntentId,
          stripeTransferId,
          payoutType: "milestone_release",
        },
      });

      return rows[0];
    });
  } catch (err) {
    if (err instanceof Error && err.message === "MILESTONE_ALREADY_RELEASED") {
      return { success: false, error: "MILESTONE_ALREADY_RELEASED" };
    }
    throw err;
  }

  return { success: true, milestone: updated, capturedAmount };
}

export async function raiseMilestoneDispute(
  orderId: string,
  userId: string,
  reason: string,
  description?: string,
): Promise<{ success: boolean; error?: string }> {
  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: eq(marketplaceOrdersTable.id, orderId),
    columns: { buyerUserId: true, sellerUserId: true, status: true },
  });

  if (!order) return { success: false, error: "ORDER_NOT_FOUND" };
  if (order.buyerUserId !== userId && order.sellerUserId !== userId) {
    return { success: false, error: "FORBIDDEN" };
  }
  if (order.status === "disputed") {
    return { success: false, error: "ALREADY_DISPUTED" };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(marketplaceOrdersTable)
      .set({ status: "disputed", updatedAt: new Date() })
      .where(eq(marketplaceOrdersTable.id, orderId));

    await tx.insert(marketplaceDisputesTable).values({
      orderId,
      raisedByUserId: userId,
      reason,
      description,
      status: "open",
    });
  });

  return { success: true };
}
