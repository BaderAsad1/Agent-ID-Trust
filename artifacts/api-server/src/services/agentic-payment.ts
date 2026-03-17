import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agenticPaymentAuthorizationsTable,
  usersTable,
} from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";
import { getStripe } from "./stripe-client";
import { activatePlanForAgent, activatePlanForUser, getHandlePriceCents } from "./billing";
import { assignHandleToAgent, getHandleTier, checkHandleAvailability } from "./handle";

export type AgentPaymentMethod = "stripe_preauth" | "usdc" | "card";

export interface AgentPaymentOptions {
  agentId: string;
  availableMethods: Array<{
    method: AgentPaymentMethod;
    description: string;
    supported: boolean;
  }>;
  plans: Array<{
    id: string;
    name: string;
    monthlyUsd: number;
    yearlyUsd: number;
    features: string[];
  }>;
  handlePricing: Array<{
    tier: string;
    annualUsd: number;
    annualCents: number;
    description: string;
  }>;
  upgradeUrl: string;
}

export async function getAgentPaymentOptions(agentId: string): Promise<AgentPaymentOptions> {
  const APP_URL = process.env.APP_URL || "https://getagent.id";

  return {
    agentId,
    availableMethods: [
      {
        method: "stripe_preauth",
        description: "Pre-authorized Stripe card (set up by agent owner)",
        supported: true,
      },
      {
        method: "usdc",
        description: "USDC on Base (send to platform address; verified via chain)",
        supported: !!process.env.BASE_RPC_URL,
      },
      {
        method: "card",
        description: "Card payment via Stripe Checkout link",
        supported: true,
      },
    ],
    plans: [
      {
        id: "starter",
        name: "Starter",
        monthlyUsd: 29,
        yearlyUsd: 290,
        features: ["5 agents", "Inbox access", "Tasks", "Email support"],
      },
      {
        id: "pro",
        name: "Pro",
        monthlyUsd: 79,
        yearlyUsd: 790,
        features: ["25 agents", "Fleet management", "Analytics", "Priority support"],
      },
      {
        id: "enterprise",
        name: "Enterprise",
        monthlyUsd: 0,
        yearlyUsd: 0,
        features: ["Contact sales", "Custom limits", "SLA", "Dedicated support"],
      },
    ],
    handlePricing: [
      { tier: "premium_3", annualUsd: 640, annualCents: 64000, description: "3-character ultra-premium handle" },
      { tier: "premium_4", annualUsd: 160, annualCents: 16000, description: "4-character premium handle" },
      { tier: "standard_5plus", annualUsd: 10, annualCents: 1000, description: "5+ character standard handle (free with active plan)" },
    ],
    upgradeUrl: `${APP_URL}/api/v1/pay/upgrade`,
  };
}

export async function setAgentSpendAuthorization(
  agentId: string,
  authorizedByUserId: string,
  spendLimitCents: number,
  paymentMethod?: AgentPaymentMethod,
  stripePaymentMethodId?: string,
): Promise<void> {
  const existing = await db.select()
    .from(agenticPaymentAuthorizationsTable)
    .where(and(
      eq(agenticPaymentAuthorizationsTable.agentId, agentId),
      eq(agenticPaymentAuthorizationsTable.isActive, true),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(agenticPaymentAuthorizationsTable).set({
      spendLimitCents,
      paymentMethod: paymentMethod ?? existing[0].paymentMethod,
      stripePaymentMethodId: stripePaymentMethodId ?? existing[0].stripePaymentMethodId,
      updatedAt: new Date(),
    }).where(eq(agenticPaymentAuthorizationsTable.id, existing[0].id));
  } else {
    await db.insert(agenticPaymentAuthorizationsTable).values({
      agentId,
      authorizedByUserId,
      spendLimitCents,
      paymentMethod: paymentMethod ?? "card",
      stripePaymentMethodId: stripePaymentMethodId ?? null,
    });
  }

  await db.update(agentsTable).set({
    paymentAuthorized: spendLimitCents > 0,
    authorizedSpendLimitCents: spendLimitCents,
    updatedAt: new Date(),
  }).where(eq(agentsTable.id, agentId));

  logger.info({ agentId, authorizedByUserId, spendLimitCents }, "[agentic-payment] Agent spend authorization set");
}

export async function getAgentAuthorization(agentId: string) {
  const auth = await db.select()
    .from(agenticPaymentAuthorizationsTable)
    .where(and(
      eq(agenticPaymentAuthorizationsTable.agentId, agentId),
      eq(agenticPaymentAuthorizationsTable.isActive, true),
    ))
    .limit(1);

  return auth[0] ?? null;
}

export interface AgentUpgradeResult {
  success: boolean;
  plan?: string;
  checkoutUrl?: string;
  error?: string;
  transactionId?: string;
}

export async function processAgentUpgrade(
  agentId: string,
  plan: "starter" | "pro",
  paymentMethod: AgentPaymentMethod,
  billingInterval: "monthly" | "yearly" = "monthly",
  usdcTxHash?: string,
): Promise<AgentUpgradeResult> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { id: true, userId: true, paymentAuthorized: true, authorizedSpendLimitCents: true },
  });

  if (!agent) {
    return { success: false, error: "Agent not found" };
  }

  const planPrices: Record<string, Record<string, number>> = {
    starter: { monthly: 2900, yearly: 29000 },
    pro: { monthly: 7900, yearly: 79000 },
  };

  const price = planPrices[plan]?.[billingInterval] ?? 0;

  if (paymentMethod === "stripe_preauth") {
    if (!agent.paymentAuthorized || (agent.authorizedSpendLimitCents ?? 0) < price) {
      return {
        success: false,
        error: `Insufficient authorization. Required: $${price / 100}, authorized: $${(agent.authorizedSpendLimitCents ?? 0) / 100}`,
      };
    }

    const auth = await getAgentAuthorization(agentId);
    if (!auth?.stripePaymentMethodId) {
      return { success: false, error: "No Stripe payment method on file for preauth" };
    }

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, agent.userId),
      columns: { id: true, stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      return { success: false, error: "No Stripe customer found for agent owner" };
    }

    try {
      const stripe = getStripe();
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price,
        currency: "usd",
        customer: user.stripeCustomerId,
        payment_method: auth.stripePaymentMethodId,
        confirm: true,
        metadata: { agentId, plan, billingInterval, type: "agent_plan_upgrade" },
        off_session: true,
      });

      if (paymentIntent.status === "succeeded") {
        await activatePlanForAgent(agentId, plan, billingInterval as "monthly" | "yearly");
        await activatePlanForUser(agent.userId, plan, undefined, billingInterval as "monthly" | "yearly");
        return { success: true, plan, transactionId: paymentIntent.id };
      }

      return { success: false, error: `Payment intent status: ${paymentIntent.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ agentId, plan, error: msg }, "[agentic-payment] Stripe preauth failed");
      return { success: false, error: `Payment failed: ${msg}` };
    }
  }

  if (paymentMethod === "usdc") {
    if (!usdcTxHash) {
      return { success: false, error: "USDC transaction hash required" };
    }

    const verified = await verifyUSDCPayment(usdcTxHash, price);
    if (!verified.valid) {
      return { success: false, error: `USDC verification failed: ${verified.reason}` };
    }

    await activatePlanForAgent(agentId, plan, billingInterval as "monthly" | "yearly");
    await activatePlanForUser(agent.userId, plan, undefined, billingInterval as "monthly" | "yearly");
    return { success: true, plan, transactionId: usdcTxHash };
  }

  if (paymentMethod === "card") {
    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const stripe = getStripe();

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, agent.userId),
      columns: { id: true, stripeCustomerId: true, email: true, displayName: true },
    });

    let customerId = user?.stripeCustomerId;
    if (!customerId && user) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.displayName ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db.update(usersTable).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    }

    const priceId = process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${billingInterval.toUpperCase()}`];

    const lineItems: import("stripe").Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency: "usd",
            product_data: { name: `Agent ID ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan` },
            unit_amount: price,
            recurring: { interval: billingInterval === "yearly" ? "year" : "month" },
          },
          quantity: 1,
        }];

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: lineItems,
      ...(customerId ? { customer: customerId } : {}),
      success_url: `${APP_URL}/dashboard?upgraded=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing`,
      metadata: { agentId, plan, billingInterval, type: "agent_plan_upgrade", userId: agent.userId },
    });
    return { success: false, checkoutUrl: session.url ?? undefined, error: "Redirect to checkout required" };
  }

  return { success: false, error: `Unknown payment method: ${paymentMethod}` };
}

export async function verifyUSDCPayment(
  txHash: string,
  expectedAmountCents: number,
): Promise<{ valid: boolean; reason?: string; amount?: number }> {
  const BASE_RPC_URL = process.env.BASE_RPC_URL;

  if (!BASE_RPC_URL) {
    logger.warn({ txHash }, "[agentic-payment] BASE_RPC_URL not set; USDC verification stubbed");
    return { valid: false, reason: "USDC verification not configured (BASE_RPC_URL missing)" };
  }

  try {
    const response = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: 1,
      }),
    });

    const data = await response.json() as { result?: { status?: string } };
    const receipt = data.result;

    if (!receipt) {
      return { valid: false, reason: "Transaction not found" };
    }

    if (receipt.status !== "0x1") {
      return { valid: false, reason: "Transaction failed on-chain" };
    }

    return { valid: true, amount: expectedAmountCents };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, reason: `RPC error: ${msg}` };
  }
}
