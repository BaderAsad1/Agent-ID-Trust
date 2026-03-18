import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { mppPaymentsTable } from "@workspace/db/schema";
import { getStripe } from "../services/stripe-client";
import { logger } from "./request-logger";

export interface MppPaymentRequirement {
  mppVersion: 1;
  provider: "stripe";
  amountCents: number;
  currency: string;
  description: string;
  resource: string;
  paymentType: string;
  idempotencyKey: string;
  acceptedMethods: string[];
  agentId?: string;
  resourceId?: string;
  trustDiscount?: {
    originalAmountCents: number;
    discountPercent: number;
    reason: string;
  };
}

const APP_URL = () => process.env.APP_URL || "https://getagent.id";

const TRUST_DISCOUNTS: Record<string, number> = {
  elite: 50,
  trusted: 25,
  verified: 10,
  basic: 0,
  unverified: 0,
};

function getTrustDiscount(trustTier: string | null | undefined): number {
  if (!trustTier) return 0;
  return TRUST_DISCOUNTS[trustTier] ?? 0;
}

function applyTrustPricing(
  amountCents: number,
  trustTier: string | null | undefined,
): { finalAmountCents: number; discount: MppPaymentRequirement["trustDiscount"] } {
  const discountPercent = getTrustDiscount(trustTier);
  if (discountPercent <= 0) {
    return { finalAmountCents: amountCents, discount: undefined };
  }
  const finalAmountCents = Math.round(amountCents * (1 - discountPercent / 100));
  return {
    finalAmountCents,
    discount: {
      originalAmountCents: amountCents,
      discountPercent,
      reason: `${trustTier} tier discount`,
    },
  };
}

export function mppPaymentRequired(
  amountCents: number,
  description: string,
  paymentType: string,
  resourceId?: string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers["x-mpp-payment"] as string | undefined;
    const effectiveResourceId = resourceId || (req.params as Record<string, string>).handle || undefined;
    const resourceUrl = `${APP_URL()}${req.originalUrl.split("?")[0]}`;

    if (!paymentHeader) {
      const agentId = req.authenticatedAgent?.id;
      const trustTier = req.authenticatedAgent?.trustTier ?? null;
      const idempotencyKey = randomBytes(16).toString("hex");

      const { finalAmountCents, discount } = applyTrustPricing(amountCents, trustTier);

      const requirement: MppPaymentRequirement = {
        mppVersion: 1,
        provider: "stripe",
        amountCents: finalAmountCents,
        currency: "usd",
        description,
        resource: resourceUrl,
        paymentType,
        idempotencyKey,
        acceptedMethods: ["card", "stripe_preauth"],
        agentId,
        resourceId: effectiveResourceId,
      };

      if (discount) {
        requirement.trustDiscount = discount;
      }

      res.setHeader("X-MPP-Requirements", JSON.stringify(requirement));
      res.status(402).json({
        error: "PAYMENT_REQUIRED",
        protocol: "stripe_mpp",
        requirement,
      });
      return;
    }

    try {
      const paymentIntentId = paymentHeader.trim();

      if (!paymentIntentId.startsWith("pi_")) {
        res.status(400).json({
          error: "INVALID_PAYMENT",
          message: "X-MPP-Payment header must contain a valid Stripe PaymentIntent ID",
        });
        return;
      }

      const agentId = req.authenticatedAgent?.id;
      if (!agentId) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message: "Agent authentication is required to use MPP payments",
        });
        return;
      }

      const trustTier = req.authenticatedAgent?.trustTier ?? null;

      const existing = await db.query.mppPaymentsTable.findFirst({
        where: and(
          eq(mppPaymentsTable.stripePaymentIntentId, paymentIntentId),
          eq(mppPaymentsTable.paymentType, paymentType),
        ),
      });

      if (existing) {
        if (existing.status === "completed" || existing.status === "captured") {
          if (existing.payerAgentId !== agentId && existing.agentId !== agentId) {
            res.status(403).json({
              error: "PAYMENT_OWNERSHIP_MISMATCH",
              message: "This payment belongs to a different agent",
            });
            return;
          }
          if (effectiveResourceId && existing.resourceId !== effectiveResourceId) {
            res.status(403).json({
              error: "RESOURCE_MISMATCH",
              message: "This payment was created for a different resource",
            });
            return;
          }
          (req as Request & { mppPayment?: unknown }).mppPayment = existing;
          next();
          return;
        }
        if (existing.status === "failed") {
          res.status(402).json({
            error: "PAYMENT_FAILED",
            message: "This payment has already failed. Please create a new payment.",
          });
          return;
        }
      }

      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

      const { finalAmountCents } = applyTrustPricing(amountCents, trustTier);

      const piAgentId = pi.metadata?.agentId;
      if (piAgentId && piAgentId !== agentId) {
        res.status(403).json({
          error: "PAYMENT_OWNERSHIP_MISMATCH",
          message: "This PaymentIntent was created for a different agent",
        });
        return;
      }

      if (pi.amount < finalAmountCents) {
        res.status(402).json({
          error: "INSUFFICIENT_PAYMENT",
          message: `Payment amount ${pi.amount} is less than required ${finalAmountCents}`,
          required: finalAmountCents,
          provided: pi.amount,
        });
        return;
      }

      if (pi.status !== "succeeded" && pi.status !== "requires_capture") {
        res.status(402).json({
          error: "PAYMENT_NOT_READY",
          message: `PaymentIntent status is ${pi.status}, expected 'succeeded' or 'requires_capture'`,
          status: pi.status,
        });
        return;
      }

      const piPaymentType = pi.metadata?.paymentType;
      if (piPaymentType && piPaymentType !== paymentType) {
        res.status(403).json({
          error: "PAYMENT_TYPE_MISMATCH",
          message: `PaymentIntent was created for '${piPaymentType}', not '${paymentType}'`,
        });
        return;
      }

      const piResourceId = pi.metadata?.resourceId;
      if (piResourceId && effectiveResourceId && piResourceId !== effectiveResourceId) {
        res.status(403).json({
          error: "RESOURCE_MISMATCH",
          message: `PaymentIntent was created for resource '${piResourceId}', not '${effectiveResourceId}'`,
        });
        return;
      }

      const crossEndpointCheck = await db.query.mppPaymentsTable.findFirst({
        where: eq(mppPaymentsTable.stripePaymentIntentId, paymentIntentId),
      });

      if (crossEndpointCheck && crossEndpointCheck.paymentType !== paymentType) {
        res.status(403).json({
          error: "PAYMENT_ALREADY_USED",
          message: "This payment has already been used for a different endpoint",
        });
        return;
      }

      const idempotencyKey = pi.metadata?.idempotencyKey || randomBytes(16).toString("hex");

      if (pi.status === "requires_capture") {
        await stripe.paymentIntents.capture(paymentIntentId);
      }

      let record;
      try {
        const [inserted] = await db.insert(mppPaymentsTable).values({
          agentId,
          idempotencyKey,
          amountCents: pi.amount,
          currency: pi.currency,
          paymentType,
          resourceId: effectiveResourceId,
          stripePaymentIntentId: paymentIntentId,
          stripeCustomerId: typeof pi.customer === "string" ? pi.customer : null,
          payerAgentId: agentId,
          status: "completed",
          trustTierAtPayment: trustTier,
          verifiedAt: new Date(),
          capturedAt: new Date(),
          metadata: {
            paymentMethod: pi.payment_method,
            capturedAt: new Date().toISOString(),
            resourceUrl,
          },
        }).returning();
        record = inserted;
      } catch (insertErr) {
        const insertMsg = insertErr instanceof Error ? insertErr.message : String(insertErr);
        if (insertMsg.includes("unique") || insertMsg.includes("duplicate")) {
          const raceWinner = await db.query.mppPaymentsTable.findFirst({
            where: and(
              eq(mppPaymentsTable.stripePaymentIntentId, paymentIntentId),
              eq(mppPaymentsTable.paymentType, paymentType),
            ),
          });
          if (raceWinner && (raceWinner.status === "completed" || raceWinner.status === "captured")) {
            if (raceWinner.payerAgentId !== agentId && raceWinner.agentId !== agentId) {
              res.status(403).json({
                error: "PAYMENT_OWNERSHIP_MISMATCH",
                message: "This payment belongs to a different agent",
              });
              return;
            }
            (req as Request & { mppPayment?: unknown }).mppPayment = raceWinner;
            next();
            return;
          }
          res.status(409).json({
            error: "CONCURRENT_PAYMENT",
            message: "Payment is being processed by another request",
          });
          return;
        }
        throw insertErr;
      }

      logger.info(
        { agentId, paymentIntentId, amountCents: pi.amount, paymentType, resourceId: effectiveResourceId },
        "[mpp] Payment verified and captured",
      );

      (req as Request & { mppPayment?: unknown }).mppPayment = record;
      next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ error: msg }, "[mpp] Payment verification failed");
      res.status(500).json({
        error: "PAYMENT_VERIFICATION_ERROR",
        message: `Failed to verify payment: ${msg}`,
      });
    }
  };
}

export async function verifyAndCaptureMppPayment(
  paymentIntentId: string,
  expectedAmountCents: number,
  paymentType: string,
  agentId: string,
  resourceId?: string,
  trustTier?: string | null,
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (pi.amount < expectedAmountCents) {
      return { success: false, error: `Insufficient payment: ${pi.amount} < ${expectedAmountCents}` };
    }

    if (pi.status !== "succeeded" && pi.status !== "requires_capture") {
      return { success: false, error: `PaymentIntent status: ${pi.status}` };
    }

    if (pi.status === "requires_capture") {
      await stripe.paymentIntents.capture(paymentIntentId);
    }

    const idempotencyKey = pi.metadata?.idempotencyKey || randomBytes(16).toString("hex");

    const [record] = await db.insert(mppPaymentsTable).values({
      agentId,
      idempotencyKey,
      amountCents: pi.amount,
      currency: pi.currency,
      paymentType,
      resourceId,
      stripePaymentIntentId: paymentIntentId,
      stripeCustomerId: typeof pi.customer === "string" ? pi.customer : null,
      payerAgentId: agentId,
      status: "completed",
      trustTierAtPayment: trustTier ?? null,
      verifiedAt: new Date(),
      capturedAt: new Date(),
      metadata: { capturedAt: new Date().toISOString() },
    }).returning();

    return { success: true, paymentId: record.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
