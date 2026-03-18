import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  paymentIntentsTable,
  paymentAuthorizationsTable,
  paymentLedgerTable,
  type PaymentIntent,
  type PaymentAuthorization,
  type PaymentLedgerEntry,
} from "@workspace/db/schema";
import { getStripe } from "./stripe-client";
import { StripeMppProvider } from "./mpp-provider";

export interface PaymentProvider {
  name: string;
  displayName: string;
  supported: boolean;
  createIntent(params: CreateIntentParams): Promise<ProviderIntentResult>;
  authorizePayment(params: AuthorizeParams): Promise<ProviderAuthResult>;
  capturePayment(intentId: string): Promise<ProviderCaptureResult>;
  refundPayment(intentId: string, amountInCents?: number): Promise<ProviderRefundResult>;
}

export interface CreateIntentParams {
  amount: number;
  currency: string;
  initiatorType: "user" | "agent" | "system";
  initiatorId: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface AuthorizeParams {
  paymentIntentId: string;
  authorizationType: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderIntentResult {
  success: boolean;
  providerReference?: string;
  clientSecret?: string;
  error?: string;
}

export interface ProviderAuthResult {
  success: boolean;
  providerReference?: string;
  error?: string;
}

export interface ProviderCaptureResult {
  success: boolean;
  error?: string;
}

export interface ProviderRefundResult {
  success: boolean;
  error?: string;
}

class StripeProvider implements PaymentProvider {
  name = "stripe";
  displayName = "Stripe";
  supported = true;

  async createIntent(params: CreateIntentParams): Promise<ProviderIntentResult> {
    try {
      const stripe = getStripe();
      const amountInCents = Math.round(params.amount * 100);
      const pi = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: params.currency.toLowerCase(),
        capture_method: "manual",
        metadata: {
          initiatorType: params.initiatorType,
          initiatorId: params.initiatorId,
          targetType: params.targetType,
          targetId: params.targetId,
        },
      });
      return {
        success: true,
        providerReference: pi.id,
        clientSecret: pi.client_secret ?? undefined,
      };
    } catch (err) {
      console.error("[StripeProvider] createIntent error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "STRIPE_ERROR",
      };
    }
  }

  async authorizePayment(params: AuthorizeParams): Promise<ProviderAuthResult> {
    try {
      const stripe = getStripe();
      const intent = await db.query.paymentIntentsTable.findFirst({
        where: eq(paymentIntentsTable.id, params.paymentIntentId),
      });
      if (!intent?.providerReference) {
        return { success: false, error: "MISSING_PROVIDER_REFERENCE" };
      }
      const pi = await stripe.paymentIntents.retrieve(intent.providerReference);
      switch (pi.status) {
        case "requires_capture":
          return { success: true, providerReference: pi.id };
        case "requires_payment_method":
        case "requires_confirmation":
        case "requires_action":
          return { success: false, error: `PAYMENT_NOT_READY:${pi.status}` };
        case "canceled":
          return { success: false, error: "PAYMENT_CANCELED" };
        case "succeeded":
          return { success: true, providerReference: pi.id };
        default:
          return { success: false, error: `UNEXPECTED_STATUS:${pi.status}` };
      }
    } catch (err) {
      console.error("[StripeProvider] authorizePayment error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "STRIPE_AUTH_ERROR",
      };
    }
  }

  async capturePayment(providerReference: string): Promise<ProviderCaptureResult> {
    try {
      const stripe = getStripe();
      await stripe.paymentIntents.capture(providerReference);
      return { success: true };
    } catch (err) {
      console.error("[StripeProvider] capturePayment error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "STRIPE_CAPTURE_ERROR",
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
      console.error("[StripeProvider] refundPayment error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "STRIPE_REFUND_ERROR",
      };
    }
  }
}

// Coinbase Agentic (USDC on Base) — gated pending BASE_RPC_URL infrastructure.
// Returns a structured PROVIDER_UNAVAILABLE response; do not promote as available.
class CoinbaseAgenticProvider implements PaymentProvider {
  name = "coinbase_agentic";
  displayName = "Coinbase Agentic (USDC)";
  supported = false;

  private unavailable(): { success: false; error: string; message: string } {
    return {
      success: false,
      error: "PROVIDER_UNAVAILABLE",
      message: "Coinbase Agentic (USDC on Base) is not currently supported. Integration is pending BASE_RPC_URL infrastructure.",
    };
  }

  async createIntent(_params: CreateIntentParams): Promise<ProviderIntentResult> {
    return this.unavailable();
  }

  async authorizePayment(_params: AuthorizeParams): Promise<ProviderAuthResult> {
    return this.unavailable();
  }

  async capturePayment(_intentId: string): Promise<ProviderCaptureResult> {
    return this.unavailable();
  }

  async refundPayment(_intentId: string): Promise<ProviderRefundResult> {
    return this.unavailable();
  }
}

// Visa Agentic Commerce — gated pending Visa partner integration.
// Returns a structured PROVIDER_UNAVAILABLE response; do not promote as available.
class VisaAgenticProvider implements PaymentProvider {
  name = "visa_agentic";
  displayName = "Visa Agentic Commerce";
  supported = false;

  private unavailable(): { success: false; error: string; message: string } {
    return {
      success: false,
      error: "PROVIDER_UNAVAILABLE",
      message: "Visa Agentic Commerce is not currently supported. Integration is pending Visa partner onboarding.",
    };
  }

  async createIntent(_params: CreateIntentParams): Promise<ProviderIntentResult> {
    return this.unavailable();
  }

  async authorizePayment(_params: AuthorizeParams): Promise<ProviderAuthResult> {
    return this.unavailable();
  }

  async capturePayment(_intentId: string): Promise<ProviderCaptureResult> {
    return this.unavailable();
  }

  async refundPayment(_intentId: string): Promise<ProviderRefundResult> {
    return this.unavailable();
  }
}

const providers: Record<string, PaymentProvider> = {
  stripe: new StripeProvider(),
  stripe_mpp: new StripeMppProvider(),
  coinbase_agentic: new CoinbaseAgenticProvider(),
  visa_agentic: new VisaAgenticProvider(),
};

export function getProvider(name: string): PaymentProvider | null {
  return providers[name] ?? null;
}

export function listProviders(): Array<{ name: string; displayName: string; supported: boolean }> {
  return Object.values(providers).map((p) => ({
    name: p.name,
    displayName: p.displayName,
    supported: p.supported,
  }));
}

export async function createPaymentIntent(
  providerName: string,
  params: CreateIntentParams,
): Promise<{ success: boolean; intent?: PaymentIntent; clientSecret?: string; error?: string; message?: string }> {
  const provider = getProvider(providerName);
  if (!provider) return { success: false, error: "PROVIDER_NOT_FOUND" };

  // For unsupported providers, delegate to the provider to get the structured error
  // with error code and human-readable message rather than a generic short-circuit.
  const result = await provider.createIntent(params);
  if (!result.success) {
    return { success: false, error: result.error, message: (result as { message?: string }).message };
  }

  const [intent] = await db
    .insert(paymentIntentsTable)
    .values({
      provider: providerName,
      initiatorType: params.initiatorType,
      initiatorId: params.initiatorId,
      targetType: params.targetType,
      targetId: params.targetId,
      amount: params.amount.toFixed(2),
      currency: params.currency,
      status: "pending",
      providerReference: result.providerReference,
      metadata: params.metadata,
    })
    .returning();

  return { success: true, intent, clientSecret: result.clientSecret };
}

export async function captureProviderPayment(
  providerName: string,
  providerReference: string,
): Promise<ProviderCaptureResult> {
  const provider = getProvider(providerName);
  if (!provider) return { success: false, error: "PROVIDER_NOT_FOUND" };
  return provider.capturePayment(providerReference);
}

export async function refundProviderPayment(
  providerName: string,
  providerReference: string,
  amountInCents?: number,
): Promise<ProviderRefundResult> {
  const provider = getProvider(providerName);
  if (!provider) return { success: false, error: "PROVIDER_NOT_FOUND" };
  return provider.refundPayment(providerReference, amountInCents);
}

export async function authorizePaymentIntent(
  intentId: string,
  authorizationType: string,
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; authorization?: PaymentAuthorization; error?: string }> {
  const intent = await db.query.paymentIntentsTable.findFirst({
    where: eq(paymentIntentsTable.id, intentId),
  });
  if (!intent) return { success: false, error: "INTENT_NOT_FOUND" };

  const provider = getProvider(intent.provider);
  if (!provider) return { success: false, error: "PROVIDER_NOT_FOUND" };

  const result = await provider.authorizePayment({
    paymentIntentId: intentId,
    authorizationType,
    metadata,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  await db
    .update(paymentIntentsTable)
    .set({ status: "authorized", updatedAt: new Date() })
    .where(eq(paymentIntentsTable.id, intentId));

  const [auth] = await db
    .insert(paymentAuthorizationsTable)
    .values({
      paymentIntentId: intentId,
      provider: intent.provider,
      authorizationType,
      status: "authorized",
      metadata: { ...metadata, providerReference: result.providerReference },
    })
    .returning();

  return { success: true, authorization: auth };
}

export async function getPaymentLedger(
  accountType: string,
  accountId: string,
  limit = 20,
  offset = 0,
): Promise<{ entries: PaymentLedgerEntry[]; total: number }> {
  const where = and(
    eq(paymentLedgerTable.accountType, accountType as "user" | "agent" | "platform"),
    eq(paymentLedgerTable.accountId, accountId),
  );

  const [entries, countResult] = await Promise.all([
    db
      .select()
      .from(paymentLedgerTable)
      .where(where)
      .orderBy(desc(paymentLedgerTable.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentLedgerTable)
      .where(where),
  ]);

  return { entries, total: countResult[0]?.count ?? 0 };
}
