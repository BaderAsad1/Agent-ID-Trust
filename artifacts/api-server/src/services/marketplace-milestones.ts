import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  marketplaceMilestonesTable,
  marketplaceOrdersTable,
  agentsTable,
  payoutLedgerTable,
  type MarketplaceMilestone,
} from "@workspace/db/schema";
import { getStripe } from "./stripe-client";
import { logger } from "../middlewares/request-logger";
import { MARKETPLACE_FEE_RATE } from "@workspace/shared-pricing";

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
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
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
    .where(and(
      eq(marketplaceMilestonesTable.id, milestoneId),
      sql`${marketplaceMilestonesTable.status} IN ('pending', 'in_progress')`,
    ))
    .returning();

  if (!updated) {
    return { success: false, error: "MILESTONE_ALREADY_COMPLETED" };
  }

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

  const sellerAgent = order.agentId
    ? await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, order.agentId),
        columns: { stripeConnectAccountId: true, stripeConnectStatus: true },
      })
    : undefined;
  if (!sellerAgent?.stripeConnectAccountId || sellerAgent.stripeConnectStatus !== "active") {
    logger.warn(
      { milestoneId, orderId: order.id, stripeConnectStatus: sellerAgent?.stripeConnectStatus },
      "[milestone] Seller payout is not ready; escrow remains unreleased",
    );
    return { success: false, error: "SELLER_PAYOUT_NOT_READY" };
  }

  const milestoneAmountCents = Math.round(parseFloat(milestone.amount) * 100);

  if (!milestone.stripePaymentIntentId) {
    return {
      success: false,
      error: "NO_ESCROW_INSTRUMENT: milestone has no Stripe PaymentIntent — cannot release without confirmed payment hold",
    };
  }

  const captureIdempotencyKey = `milestone_capture_${milestoneId}`;
  const transferIdempotencyKey = `milestone_transfer_${milestoneId}`;

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1 (intent): SELECT FOR UPDATE the milestone row, then insert (or
  //   recover) a `pending` payout_ledger row that records the chosen
  //   idempotency keys. This commits BEFORE any Stripe call so that a
  //   crash at any later point leaves a durable trace and the next retry
  //   can replay Stripe (idempotently) and finalize. (audit H9.)
  // ──────────────────────────────────────────────────────────────────────────
  type IntentOutcome =
    | { kind: "fresh" | "recover"; payoutLedgerId: string }
    | { kind: "already_released" }
    | { kind: "invalid"; status: string };

  const intent: IntentOutcome = await db.transaction(async (tx) => {
    const lockedRows = await tx.execute(
      sql`SELECT id, status FROM marketplace_milestones WHERE id = ${milestoneId} FOR UPDATE`,
    );
    const locked = (lockedRows.rows ?? lockedRows)[0] as { id: string; status: string } | undefined;
    if (!locked) {
      return { kind: "invalid", status: "missing" };
    }
    if (locked.status === "released") {
      return { kind: "already_released" };
    }
    if (locked.status !== "completed") {
      return { kind: "invalid", status: locked.status };
    }

    // If there's already a pending payout for this milestone, this is a
    // recovery scenario — reuse the row instead of creating a duplicate.
    const existing = await tx.query.payoutLedgerTable.findFirst({
      where: and(
        eq(payoutLedgerTable.relatedOrderId, order.id),
        eq(payoutLedgerTable.status, "pending"),
        sql`(${payoutLedgerTable.metadata}->>'milestoneId') = ${milestoneId}`,
      ),
    });
    if (existing) {
      return { kind: "recover", payoutLedgerId: existing.id };
    }

    const [created] = await tx
      .insert(payoutLedgerTable)
      .values({
        relatedOrderId: order.id,
        sellerUserId: order.sellerUserId,
        provider: order.paymentProvider ?? "stripe",
        amount: milestone.amount,
        currency: "USD",
        status: "pending",
        metadata: {
          milestoneId,
          milestoneAmount: milestone.amount,
          stripePaymentIntentId: milestone.stripePaymentIntentId,
          captureIdempotencyKey,
          transferIdempotencyKey,
          payoutType: "milestone_release",
          intentStage: "pending_stripe_payout",
        },
      })
      .returning({ id: payoutLedgerTable.id });

    return { kind: "fresh", payoutLedgerId: created.id };
  });

  if (intent.kind === "already_released") {
    return { success: false, error: "MILESTONE_ALREADY_RELEASED" };
  }
  if (intent.kind === "invalid") {
    return {
      success: false,
      error: `MILESTONE_NOT_COMPLETED: current status is '${intent.status}'. Milestone must be marked completed by seller before buyer can release escrow.`,
    };
  }

  const payoutLedgerId = intent.payoutLedgerId;

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2 (Stripe): capture the per-milestone PI, then push the seller's
  // share via Connect transfer. Both use stable idempotency keys so retries
  // (whether due to crash or operator-initiated replay) cannot double-charge
  // or double-payout.
  // ──────────────────────────────────────────────────────────────────────────
  let capturedAmountCents = milestoneAmountCents;
  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(milestone.stripePaymentIntentId);

    if (pi.status === "requires_capture") {
      await stripe.paymentIntents.capture(
        milestone.stripePaymentIntentId,
        {},
        { idempotencyKey: captureIdempotencyKey },
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
    logger.error({ milestoneId, orderId: order.id, error: msg }, "[milestone] Stripe capture failed — pending payout_ledger row remains for retry");
    return { success: false, error: `STRIPE_CAPTURE_FAILED: ${msg}` };
  }

  const capturedAmount = (capturedAmountCents / 100).toFixed(2);

  let stripeTransferId: string;
  const milestonePayoutStatus = "completed";

  try {
    const stripe = getStripe();
    const sellerPayout = Math.round(capturedAmountCents * (1 - MARKETPLACE_FEE_RATE));
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
      { idempotencyKey: transferIdempotencyKey },
    );
    stripeTransferId = transfer.id;
    logger.info(
      { milestoneId, orderId: order.id, transferId: transfer.id, amount: sellerPayout },
      "[milestone] Stripe Connect transfer executed for milestone release",
    );
  } catch (payoutErr) {
    logger.error(
      { milestoneId, orderId: order.id, error: payoutErr instanceof Error ? payoutErr.message : String(payoutErr) },
      "[milestone] Stripe Connect transfer failed — pending payout intent remains retryable",
    );
    return { success: false, error: "PAYOUT_FAILED_RETRYABLE" };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 3 (finalize): atomic milestone release + order increment + payout
  // ledger finalization in a single transaction. The milestone UPDATE uses
  // WHERE status = 'completed' so a concurrent finalizer can't double-credit
  // the order. If the milestone has already advanced (e.g. another caller
  // beat us), still finalize the ledger row so its `pending` row doesn't
  // linger.
  // ──────────────────────────────────────────────────────────────────────────
  const finalizeMetadata = JSON.stringify({
    capturedAmount,
    capturedAmountCents,
    stripeTransferId,
    payoutStatus: milestonePayoutStatus,
    intentStage: "finalized",
  });

  const finalized = await db.transaction(async (tx) => {
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

    if (rows.length > 0) {
      await tx
        .update(marketplaceOrdersTable)
        .set({
          releasedAmount: sql`(COALESCE(${marketplaceOrdersTable.releasedAmount}::numeric, 0) + ${parseFloat(capturedAmount)})::text`,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceOrdersTable.id, order.id));
    }

    await tx
      .update(payoutLedgerTable)
      .set({
        status: milestonePayoutStatus,
        metadata: sql`COALESCE(${payoutLedgerTable.metadata}, '{}'::jsonb) || ${finalizeMetadata}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(payoutLedgerTable.id, payoutLedgerId));

    return rows[0];
  });

  if (!finalized) {
    // Another concurrent caller (or a recovered prior attempt) already
    // released this milestone. The payout_ledger row is still finalized
    // above so no money sits in limbo. Return the already-released row.
    const current = await db.query.marketplaceMilestonesTable.findFirst({
      where: eq(marketplaceMilestonesTable.id, milestoneId),
    });
    if (current?.status === "released") {
      return { success: true, milestone: current, capturedAmount: current.capturedAmount ?? capturedAmount };
    }
    return { success: false, error: "MILESTONE_ALREADY_RELEASED" };
  }

  return { success: true, milestone: finalized, capturedAmount };
}

// Dispute flow lives in services/disputes.ts. This file historically exported
// a `raiseMilestoneDispute` helper; the dispute service now owns that logic so
// it can also send notifications and resolve via Stripe.
