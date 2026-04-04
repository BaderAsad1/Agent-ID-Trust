import { HttpClient } from "../utils/http.js";

export interface MppPaymentRequirement {
  mppVersion: number;
  provider: string;
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

export interface MppPaymentResult {
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  error?: string;
}

export interface MppCreateIntentOptions {
  amountCents: number;
  currency?: string;
  paymentType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export class MppModule {
  constructor(
    private http: HttpClient,
    private agentId: string,
  ) {}

  static isMppPaymentRequired(response: Response | { status: number; headers?: { get?: (name: string) => string | null } }): boolean {
    if (response.status !== 402) return false;
    if (response.headers && typeof response.headers.get === "function") {
      const reqHeader = response.headers.get("x-mpp-requirements");
      return !!reqHeader;
    }
    return false;
  }

  static parseMppRequirement(responseBody: unknown): MppPaymentRequirement | null {
    if (typeof responseBody !== "object" || responseBody === null) return null;
    const body = responseBody as Record<string, unknown>;
    if (body.protocol !== "stripe_mpp" || !body.requirement) return null;
    return body.requirement as MppPaymentRequirement;
  }

  async createPaymentIntent(options: MppCreateIntentOptions): Promise<MppPaymentResult> {
    return this.http.post<MppPaymentResult>("/api/v1/mpp/create-intent", {
      amountCents: options.amountCents,
      currency: options.currency || "usd",
      paymentType: options.paymentType || "api_call",
      resourceId: options.resourceId,
      metadata: options.metadata,
    });
  }

  async payAndRetry<T = unknown>(
    url: string,
    requirement: MppPaymentRequirement,
    paymentIntentId: string,
    options?: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    return this.http.request<T>(options?.method || "GET", path, options?.body, {
      "X-MPP-Payment": paymentIntentId,
      ...(options?.headers || {}),
    });
  }

  async getPaymentHistory(limit = 20, offset = 0): Promise<{ payments: unknown[]; total: number }> {
    return this.http.get(`/api/v1/mpp/payments/history?limit=${limit}&offset=${offset}`);
  }

  async getPayment(paymentId: string): Promise<{ payment: unknown }> {
    return this.http.get(`/api/v1/mpp/payments/${paymentId}`);
  }

  static listProviders(): Array<{ name: string; protocol: string; description: string }> {
    return [
      { name: "stripe_mpp", protocol: "stripe_mpp", description: "Stripe Machine Payments Protocol — fiat payments via Stripe" },
      { name: "x402_usdc", protocol: "x402", description: "x402 USDC on Base — crypto payments via USDC stablecoin" },
    ];
  }
}
