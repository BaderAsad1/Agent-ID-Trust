import type { HttpClient } from "../utils/http.js";

export interface WalletInfo {
  agentId: string;
  walletId: string | null;
  walletAddress: string | null;
  provider: string | null;
  status: "active" | "pending" | "suspended" | "none";
  createdAt: string | null;
}

export interface WalletBalance {
  agentId: string;
  balanceCents: number;
  balanceFormatted: string;
  currency: string;
  lastUpdatedAt: string | null;
}

export interface WalletTransaction {
  id: string;
  agentId: string;
  type: "credit" | "debit" | "hold" | "release";
  amountCents: number;
  currency: string;
  description: string | null;
  referenceId: string | null;
  status: "pending" | "completed" | "failed" | "reversed";
  createdAt: string;
}

export interface WalletTransactionsResult {
  transactions: WalletTransaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface SpendingRule {
  id: string;
  agentId: string;
  label: string;
  maxAmountCents: number;
  period: "daily" | "weekly" | "monthly" | "per_transaction";
  active: boolean;
  createdAt: string;
}

export interface ListSpendingRulesResult {
  rules: SpendingRule[];
}

export interface CreateSpendingRuleOptions {
  label: string;
  maxAmountCents: number;
  period: "daily" | "weekly" | "monthly" | "per_transaction";
}

export class WalletModule {
  private http: HttpClient;
  private agentId: string;

  constructor(http: HttpClient, agentId: string) {
    this.http = http;
    this.agentId = agentId;
  }

  /**
   * Get wallet information for this agent.
   */
  async getInfo(): Promise<WalletInfo> {
    return this.http.get<WalletInfo>(`/api/v1/agents/${this.agentId}/wallet/info`);
  }

  /**
   * Get the current wallet balance.
   */
  async getBalance(): Promise<WalletBalance> {
    return this.http.get<WalletBalance>(`/api/v1/agents/${this.agentId}/wallet/balance`);
  }

  /**
   * List wallet transactions with optional pagination.
   */
  async getTransactions(options?: {
    limit?: number;
    offset?: number;
  }): Promise<WalletTransactionsResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.offset !== undefined) params.set("offset", String(options.offset));
    const qs = params.toString();
    return this.http.get<WalletTransactionsResult>(
      `/api/v1/agents/${this.agentId}/wallet/transactions${qs ? `?${qs}` : ""}`,
    );
  }

  /**
   * List spending rules for this agent's wallet.
   */
  async getSpendingRules(): Promise<ListSpendingRulesResult> {
    return this.http.get<ListSpendingRulesResult>(
      `/api/v1/agents/${this.agentId}/wallet/spending-rules`,
    );
  }

  /**
   * Create a new spending rule.
   */
  async createSpendingRule(options: CreateSpendingRuleOptions): Promise<SpendingRule> {
    return this.http.post<SpendingRule>(
      `/api/v1/agents/${this.agentId}/wallet/spending-rules`,
      options,
    );
  }

  /**
   * Delete a spending rule by ID.
   */
  async deleteSpendingRule(ruleId: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `/api/v1/agents/${this.agentId}/wallet/spending-rules/${ruleId}`,
    );
  }

  /**
   * Get the full wallet resource (balance + info combined).
   */
  async get(): Promise<{
    wallet: WalletInfo;
    balance: WalletBalance | null;
  }> {
    return this.http.get(`/api/v1/agents/${this.agentId}/wallet`);
  }
}
