import { randomBytes } from "crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { mppPaymentsTable } from "@workspace/db/schema";
import { getStripe } from "./stripe-client";
import { logger } from "../middlewares/request-logger";
import type {
  PaymentProvider,
  CreateIntentParams,
  AuthorizeParams,
  ProviderIntentResult,
  ProviderAuthResult,
  ProviderCaptureResult,
  ProviderRefundResult,
} from "./payment-providers";

export class StripeMppProvider implements PaymentProvider {
  name = "stripe_mpp";
  displayName = "Stripe Machine Payments Protocol";
  supported = true;

  async createIntent(params: CreateIntentParams): Promise<ProviderIntentResult> {
    try {
      const stripe = getStripe();
      const amountInCents = Math.round(params.amount * 100);
      const idempotencyKey = randomBytes(16).toString("hex");

      const pi = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: params.currency.toLowerCase(),
        capture_method: "manual",
        metadata: {
          protocol: "stripe_mpp",
          agentId: params.initiatorId,
          initiatorType: params.initiatorType,
          initiatorId: params.initiatorId,
          targetType: params.targetType,
          targetId: params.targetId,
          paymentType: params.targetType,
          idempotencyKey,
          ...(params.metadata as Record<string, string> || {}),
        },
      }, {
        idempotencyKey: `mpp_create_${idempotencyKey}`,
      });

      return {
        success: true,
        providerReference: pi.id,
        clientSecret: pi.client_secret ?? undefined,
      };
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, "[StripeMppProvider] createIntent error");
      return {
        success: false,
        error: err instanceof Error ? err.message : "MPP_STRIPE_ERROR",
      };
    }
  }

  async authorizePayment(params: AuthorizeParams): Promise<ProviderAuthResult> {
    try {
      const stripe = getStripe();
      let stripeRef: string | undefined;

      if (params.paymentIntentId.startsWith("pi_")) {
        stripeRef = params.paymentIntentId;
      } else {
        const intent = await db.query.mppPaymentsTable.findFirst({
          where: eq(mppPaymentsTable.id, params.paymentIntentId),
        });
        stripeRef = intent?.stripePaymentIntentId ?? undefined;
      }

      if (!stripeRef) {
        return { success: false, error: "MISSING_STRIPE_REFERENCE" };
      }

      const pi = await stripe.paymentIntents.retrieve(stripeRef);

      switch (pi.status) {
        case "requires_capture":
        case "succeeded":
          return { success: true, providerReference: pi.id };
        case "requires_payment_method":
        case "requires_confirmation":
        case "requires_action":
          return { success: false, error: `PAYMENT_NOT_READY:${pi.status}` };
        case "canceled":
          return { success: false, error: "PAYMENT_CANCELED" };
        default:
          return { success: false, error: `UNEXPECTED_STATUS:${pi.status}` };
      }
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, "[StripeMppProvider] authorizePayment error");
      return {
        success: false,
        error: err instanceof Error ? err.message : "MPP_AUTH_ERROR",
      };
    }
  }

  async capturePayment(providerReference: string): Promise<ProviderCaptureResult> {
    try {
      const stripe = getStripe();
      await stripe.paymentIntents.capture(providerReference);
      return { success: true };
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, "[StripeMppProvider] capturePayment error");
      return {
        success: false,
        error: err instanceof Error ? err.message : "MPP_CAPTURE_ERROR",
      };
    }
  }

  async refundPayment(providerReference: string, amountInCents?: number): Promise<ProviderRefundResult> {
    try {
      const stripe = getStripe();
      const params: { payment_intent: string; amount?: number } = {
        payment_intent: providerReference,
      };
      if (amountInCents !== undefined) {
        params.amount = amountInCents;
      }
      await stripe.refunds.create(params);
      return { success: true };
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, "[StripeMppProvider] refundPayment error");
      return {
        success: false,
        error: err instanceof Error ? err.message : "MPP_REFUND_ERROR",
      };
    }
  }
}

export async function createMppPaymentIntent(params: {
  amountCents: number;
  currency: string;
  paymentType: string;
  resourceId?: string;
  agentId: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; paymentIntentId?: string; clientSecret?: string; error?: string }> {
  try {
    const stripe = getStripe();
    const idempotencyKey = randomBytes(16).toString("hex");

    const pi = await stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      capture_method: "manual",
      metadata: {
        protocol: "stripe_mpp",
        agentId: params.agentId,
        paymentType: params.paymentType,
        resourceId: params.resourceId || "",
        idempotencyKey,
      },
    }, {
      idempotencyKey: `mpp_${idempotencyKey}`,
    });

    const [record] = await db.insert(mppPaymentsTable).values({
      agentId: params.agentId,
      idempotencyKey,
      amountCents: params.amountCents,
      currency: params.currency,
      paymentType: params.paymentType,
      resourceId: params.resourceId,
      stripePaymentIntentId: pi.id,
      status: "pending",
      metadata: params.metadata,
    }).returning();

    return {
      success: true,
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, "[mpp-provider] Failed to create payment intent");
    return { success: false, error: msg };
  }
}

export async function getMppPaymentHistory(
  agentId: string,
  limit = 20,
  offset = 0,
): Promise<{ payments: unknown[]; total: number }> {
  const where = eq(mppPaymentsTable.agentId, agentId);

  const [payments, countResult] = await Promise.all([
    db.select()
      .from(mppPaymentsTable)
      .where(where)
      .orderBy(desc(mppPaymentsTable.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(mppPaymentsTable)
      .where(where),
  ]);

  return { payments, total: countResult[0]?.count ?? 0 };
}
