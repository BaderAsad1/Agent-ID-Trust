import { Router, raw } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { marketplaceOrdersTable, agentsTable, tasksTable } from "@workspace/db/schema";
import { logger } from "../../middlewares/request-logger";
import {
  verifyStripeWebhook,
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionCreatedOrUpdated,
  claimWebhookEvent,
  finalizeWebhookEvent,
  activatePlanForUser,
  deactivatePlanForUser,
} from "../../services/billing";
import { assignHandleToAgent, processHandleExpiry } from "../../services/handle";
import { AppError } from "../../middlewares/error-handler";
import { handleConnectAccountUpdated } from "../../services/stripe-connect";
import type Stripe from "stripe";

const router = Router();

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const orderId = pi.metadata?.orderId;
  if (!orderId) {
    logger.info("[webhook] payment_intent.succeeded: no orderId in metadata, skipping");
    return;
  }

  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: eq(marketplaceOrdersTable.id, orderId),
  });

  if (!order) {
    logger.warn({ orderId }, "[webhook] payment_intent.succeeded: order not found");
    return;
  }

  if (order.status === "payment_pending") {
    await db
      .update(marketplaceOrdersTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(marketplaceOrdersTable.id, orderId));
    logger.info({ orderId }, "[webhook] payment_intent.succeeded: advanced order from payment_pending to pending");
  } else {
    logger.info({ orderId, status: order.status }, "[webhook] payment_intent.succeeded: order already processed, no action");
  }
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const orderId = pi.metadata?.orderId;
  if (!orderId) {
    logger.info("[webhook] payment_intent.payment_failed: no orderId in metadata, skipping");
    return;
  }

  const order = await db.query.marketplaceOrdersTable.findFirst({
    where: eq(marketplaceOrdersTable.id, orderId),
  });

  if (!order) {
    logger.warn({ orderId }, "[webhook] payment_intent.payment_failed: order not found");
    return;
  }

  if (order.status === "payment_pending") {
    await db
      .update(marketplaceOrdersTable)
      .set({ status: "payment_failed", updatedAt: new Date() })
      .where(eq(marketplaceOrdersTable.id, orderId));
    logger.info({ orderId }, "[webhook] payment_intent.payment_failed: marked order as payment_failed");
  } else {
    logger.info({ orderId, status: order.status }, "[webhook] payment_intent.payment_failed: order in different status, no action");
  }
}

async function handlePaymentIntentCapturableUpdated(pi: Stripe.PaymentIntent) {
  // Fired when a manual-capture PaymentIntent is confirmed by the client and
  // funds are now authorised (reserved) on the card.
  //
  // For task payments: advance escrow from payment_pending → held.
  // For marketplace orders: advance order from payment_pending → pending.
  // (payment_intent.succeeded fires only after capture, so this is the correct
  //  event to use as the "buyer authorised payment" signal for manual-capture flows.)

  if (pi.metadata?.taskId) {
    const taskId = pi.metadata.taskId;
    const updated = await db
      .update(tasksTable)
      .set({ escrowStatus: "held" as string, updatedAt: new Date() })
      .where(and(
        eq(tasksTable.id, taskId),
        eq(tasksTable.stripePaymentIntentId, pi.id),
        sql`${tasksTable.escrowStatus} = 'payment_pending'`,
      ))
      .returning({ id: tasksTable.id });
    if (updated.length > 0) {
      logger.info({ taskId }, "[webhook] amount_capturable_updated: task escrow advanced to held");
    } else {
      logger.info({ taskId }, "[webhook] amount_capturable_updated: task not in payment_pending, skipping");
    }
  }

  if (pi.metadata?.orderId) {
    const orderId = pi.metadata.orderId;
    const updated = await db
      .update(marketplaceOrdersTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(
        eq(marketplaceOrdersTable.id, orderId),
        eq(marketplaceOrdersTable.status, "payment_pending"),
      ))
      .returning({ id: marketplaceOrdersTable.id });
    if (updated.length > 0) {
      logger.info({ orderId }, "[webhook] amount_capturable_updated: order advanced from payment_pending to pending");
    } else {
      logger.info({ orderId }, "[webhook] amount_capturable_updated: order not in payment_pending, skipping");
    }
  }

  if (!pi.metadata?.taskId && !pi.metadata?.orderId) {
    logger.info("[webhook] amount_capturable_updated: no taskId or orderId in metadata, skipping");
  }
}

function handleChargeRefunded(charge: Stripe.Charge) {
  const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  logger.info({ chargeId: charge.id, paymentIntent: piId ?? "N/A", amountRefunded: charge.amount_refunded }, "[webhook] charge.refunded");
}

router.post(
  "/stripe",
  raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      const signature = req.headers["stripe-signature"];
      if (!signature) {
        throw new AppError(400, "MISSING_SIGNATURE", "Missing stripe-signature header");
      }

      let event: Stripe.Event;
      try {
        event = verifyStripeWebhook(
          req.body as Buffer,
          signature as string,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Verification failed";
        if (message === "STRIPE_WEBHOOK_SECRET is not configured") {
          throw new AppError(503, "WEBHOOK_NOT_CONFIGURED", "Webhook handler not configured");
        }
        throw new AppError(400, "WEBHOOK_VERIFICATION_FAILED", `Webhook verification failed: ${message}`);
      }

      const claimResult = await claimWebhookEvent("stripe", event.type, event.id, event.data.object);
      if (claimResult === "already_processed") {
        res.json({ received: true, status: "already_processed" });
        return;
      }

      try {
        switch (event.type) {
          case "checkout.session.completed":
            await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
            break;
          case "invoice.paid":
            await handleInvoicePaid(event.data.object as Stripe.Invoice);
            break;
          case "invoice.payment_failed":
            await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
            break;
          case "customer.subscription.created":
          case "customer.subscription.updated": {
            const subscription = event.data.object as Stripe.Subscription;
            const subType = subscription.metadata?.type;
            const subUserId = subscription.metadata?.userId;
            const subPlan = subscription.metadata?.plan;
            const subInterval = (subscription.metadata?.billingInterval ?? "monthly") as "monthly" | "yearly";

            if (subType === "handle_registration" && subscription.metadata?.handle && subUserId) {
              const handle = subscription.metadata.handle;
              // Re-check availability before assigning — prevents double-assignment if two users
              // raced through checkout for the same handle. The unique DB constraint is a last
              // resort; this check gives us a clean error path to log and alert on.
              const existingOwner = await db.query.agentsTable.findFirst({
                where: and(eq(agentsTable.handle, handle)),
                columns: { id: true, userId: true },
              });
              if (existingOwner && existingOwner.userId !== subUserId) {
                // Handle already owned by a different user — log a critical alert so an operator
                // can issue a refund. Do NOT overwrite the existing owner's handle.
                logger.error(
                  { handle, subUserId, existingOwnerId: existingOwner.userId, subscriptionId: subscription.id },
                  "[webhook] HANDLE_RACE_CONFLICT: handle already assigned to a different user. Manual refund required.",
                );
              } else {
                const agent = await db.query.agentsTable.findFirst({
                  where: and(eq(agentsTable.handle, handle), eq(agentsTable.userId, subUserId)),
                  columns: { id: true, handle: true },
                });
                if (agent) {
                  const { getHandleTier } = await import("../../services/handle");
                  const tierInfo = getHandleTier(handle);
                  await assignHandleToAgent(agent.id, handle, {
                    tier: tierInfo.tier,
                    paid: true,
                    stripeSubscriptionId: subscription.id,
                  });
                }
              }
            } else {
              await handleSubscriptionCreatedOrUpdated(subscription);
              if (subUserId && subPlan && (subPlan === "starter" || subPlan === "pro")) {
                await activatePlanForUser(subUserId, subPlan, subscription.id, subInterval);
              }
            }
            break;
          }
          case "customer.subscription.deleted": {
            const deletedSub = event.data.object as Stripe.Subscription;
            const deletedType = deletedSub.metadata?.type;
            const deletedUserId = deletedSub.metadata?.userId;

            if (deletedType === "handle_registration" && deletedSub.metadata?.handle && deletedUserId) {
              const handle = deletedSub.metadata.handle;
              const agent = await db.query.agentsTable.findFirst({
                where: and(eq(agentsTable.handle, handle), eq(agentsTable.userId, deletedUserId)),
                columns: { id: true },
              });
              if (agent) {
                await processHandleExpiry(agent.id);
              }
            } else {
              await handleSubscriptionDeleted(deletedSub);
              if (deletedUserId) {
                await deactivatePlanForUser(deletedUserId);
              }
            }
            break;
          }
          case "payment_intent.succeeded":
            await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
            break;
          case "payment_intent.amount_capturable_updated":
            // Funds are now authorised (held) on the card — advance task escrow to "held".
            await handlePaymentIntentCapturableUpdated(event.data.object as Stripe.PaymentIntent);
            break;
          case "payment_intent.payment_failed":
            await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
            break;
          case "charge.refunded":
            handleChargeRefunded(event.data.object as Stripe.Charge);
            break;
          case "account.updated": {
            const acct = event.data.object as Stripe.Account;
            if (acct.id) {
              await handleConnectAccountUpdated(acct.id);
            }
            break;
          }
          default:
            await finalizeWebhookEvent("stripe", event.id, "skipped");
            res.json({ received: true, status: "skipped" });
            return;
        }

        await finalizeWebhookEvent("stripe", event.id, "processed");
        res.json({ received: true, status: "processed" });
      } catch (err) {
        await finalizeWebhookEvent("stripe", event.id, "failed");
        next(err);
      }
    } catch (err) {
      next(err);
    }
  },
);

router.all("/coinbase", (_req, _res, next) => {
  next(new AppError(501, "NOT_ENABLED", "Coinbase webhooks are not enabled"));
});

router.all("/visa", (_req, _res, next) => {
  next(new AppError(501, "NOT_ENABLED", "Visa webhooks are not enabled"));
});

export default router;
