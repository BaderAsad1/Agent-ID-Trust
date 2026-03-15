import { Router, raw } from "express";
import {
  verifyStripeWebhook,
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  claimWebhookEvent,
  finalizeWebhookEvent,
} from "../../services/billing";
import { AppError } from "../../middlewares/error-handler";
import type Stripe from "stripe";

const router = Router();

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
          case "customer.subscription.deleted":
            await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
            break;
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
