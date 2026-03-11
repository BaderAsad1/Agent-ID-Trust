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

export interface PaymentProvider {
  name: string;
  displayName: string;
  supported: boolean;
  createIntent(params: CreateIntentParams): Promise<ProviderIntentResult>;
  authorizePayment(params: AuthorizeParams): Promise<ProviderAuthResult>;
  capturePayment(intentId: string): Promise<ProviderCaptureResult>;
  refundPayment(intentId: string): Promise<ProviderRefundResult>;
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
    const reference = `pi_sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return { success: true, providerReference: reference };
  }

  async authorizePayment(params: AuthorizeParams): Promise<ProviderAuthResult> {
    const reference = `auth_sim_${Date.now()}`;
    return { success: true, providerReference: reference };
  }

  async capturePayment(intentId: string): Promise<ProviderCaptureResult> {
    return { success: true };
  }

  async refundPayment(intentId: string): Promise<ProviderRefundResult> {
    return { success: true };
  }
}

class CoinbaseAgenticProvider implements PaymentProvider {
  name = "coinbase_agentic";
  displayName = "Coinbase Agentic (USDC)";
  supported = false;

  async createIntent(_params: CreateIntentParams): Promise<ProviderIntentResult> {
    return { success: false, error: "PROVIDER_NOT_AVAILABLE" };
  }

  async authorizePayment(_params: AuthorizeParams): Promise<ProviderAuthResult> {
    return { success: false, error: "PROVIDER_NOT_AVAILABLE" };
  }

  async capturePayment(_intentId: string): Promise<ProviderCaptureResult> {
    return { success: false, error: "PROVIDER_NOT_AVAILABLE" };
  }

  async refundPayment(_intentId: string): Promise<ProviderRefundResult> {
    return { success: false, error: "PROVIDER_NOT_AVAILABLE" };
  }
}

class VisaAgenticProvider implements PaymentProvider {
  name = "visa_agentic";
  displayName = "Visa Agentic Commerce";
  supported = false;

  async createIntent(_params: CreateIntentParams): Promise<ProviderIntentResult> {
    return { success: false, error: "PROVIDER_NOT_AVAILABLE" };
  }

  async authorizePayment(_params: AuthorizeParams): Promise<ProviderAuthResult> {
    return { success: false, error: "PROVIDER_NOT_AVAILABLE" };
  }

  async capturePayment(_intentId: string): Promise<ProviderCaptureResult> {
    return { success: false, error: "PROVIDER_NOT_AVAILABLE" };
  }

  async refundPayment(_intentId: string): Promise<ProviderRefundResult> {
    return { success: false, error: "PROVIDER_NOT_AVAILABLE" };
  }
}

const providers: Record<string, PaymentProvider> = {
  stripe: new StripeProvider(),
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
): Promise<{ success: boolean; intent?: PaymentIntent; error?: string }> {
  const provider = getProvider(providerName);
  if (!provider) return { success: false, error: "PROVIDER_NOT_FOUND" };
  if (!provider.supported) return { success: false, error: "PROVIDER_NOT_AVAILABLE" };

  const result = await provider.createIntent(params);
  if (!result.success) {
    return { success: false, error: result.error };
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

  return { success: true, intent };
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
