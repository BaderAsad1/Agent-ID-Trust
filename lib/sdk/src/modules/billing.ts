import type { HttpClient } from "../utils/http.js";

export interface PlanDetails {
  id: string;
  name: string;
  price: { monthly: number | null; yearly: number | null };
  agentLimit: number | null;
  features: string[];
  cta: string;
  popular: boolean;
  contactUrl?: string;
}

export interface HandlePricingTier {
  tier: string;
  chars: string;
  annualUsd: number | null;
  annualCents: number | null;
  isFree: boolean;
  onChainMintPrice: number | null;
  onChainMintPriceDollars?: number;
  includesOnChainMint: boolean;
  note: string;
}

export interface PlansResult {
  launchMode: boolean;
  plans: string[];
  planDetails: PlanDetails[];
  handlePricing: HandlePricingTier[];
  freeTierAgentLimit: number;
}

export interface SubscriptionInfo {
  plan: string;
  limits: {
    plan: string;
    agentLimit: number | null;
    canUsePremiumRouting: boolean;
    canUseCustomDomains: boolean;
    [key: string]: unknown;
  };
  subscription: {
    status: string;
    billingInterval: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    providerSubscriptionId: string | null;
  } | null;
}

export interface CheckoutOptions {
  plan?: "starter" | "pro";
  priceId?: string;
  billingInterval?: "monthly" | "yearly";
  successUrl?: string;
  cancelUrl?: string;
}

export interface HandleCheckoutOptions {
  handle: string;
  agentId?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface HandleCheckoutResult {
  url: string;
  handle: string;
  priceCents: number;
  priceDollars: number;
  included: boolean;
}

export interface CryptoCheckoutOptions {
  handle: string;
  agentId?: string;
  token?: "USDC" | "USDT";
}

export interface AgentBillingStatus {
  agentId: string;
  status: string;
  plan: string;
  [key: string]: unknown;
}

export class BillingModule {
  constructor(private http: HttpClient) {}

  getPlans(): Promise<PlansResult> {
    return this.http.get<PlansResult>("/api/v1/billing/plans");
  }

  getSubscription(): Promise<SubscriptionInfo> {
    return this.http.get<SubscriptionInfo>("/api/v1/billing/subscription");
  }

  createCheckout(options: CheckoutOptions): Promise<{ url: string }> {
    return this.http.post<{ url: string }>("/api/v1/billing/checkout", options);
  }

  createHandleCheckout(options: HandleCheckoutOptions): Promise<HandleCheckoutResult> {
    return this.http.post<HandleCheckoutResult>("/api/v1/billing/handle-checkout", options);
  }

  createCryptoCheckout(options: CryptoCheckoutOptions): Promise<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>("/api/v1/billing/crypto-checkout", {
      token: "USDC",
      ...options,
    });
  }

  pollCryptoPayment(options: {
    handle: string;
    reference: string;
    token?: "USDC" | "USDT";
    agentId?: string;
  }): Promise<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>("/api/v1/billing/crypto-payment-status", {
      token: "USDC",
      ...options,
    });
  }

  getPortalUrl(): Promise<{ url: string }> {
    return this.http.post<{ url: string }>("/api/v1/billing/portal", {});
  }

  cancelSubscription(): Promise<{ message: string }> {
    return this.http.post<{ message: string }>("/api/v1/billing/cancel", {});
  }

  activateAgent(agentId: string): Promise<{ subscription: Record<string, unknown> }> {
    return this.http.post<{ subscription: Record<string, unknown> }>(
      `/api/v1/billing/agents/${agentId}/activate`,
      {},
    );
  }

  deactivateAgent(agentId: string): Promise<{ message: string }> {
    return this.http.post<{ message: string }>(
      `/api/v1/billing/agents/${agentId}/deactivate`,
      {},
    );
  }

  getAgentBillingStatus(agentId: string): Promise<AgentBillingStatus> {
    return this.http.get<AgentBillingStatus>(`/api/v1/billing/agents/${agentId}/status`);
  }
}
