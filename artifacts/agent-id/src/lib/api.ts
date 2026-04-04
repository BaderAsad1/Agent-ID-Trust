const BASE = `${import.meta.env.BASE_URL}api/v1`.replace(/\/\//g, '/');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const MAX_RETRIES = 2;
const RETRY_DELAYS = [500, 1500];
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

function isRetryable(method: string | undefined, status: number): boolean {
  if (!RETRYABLE_STATUSES.has(status)) return false;
  const m = (method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  return match ? match[1] : null;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "AgentID-Client/1.0 AgentID-Web/1.0",
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  let lastError: ApiError | Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new ApiError(
          res.status,
          body.code || "UNKNOWN",
          body.message || body.error || `HTTP ${res.status}`,
          body,
        );

        if (attempt < MAX_RETRIES && isRetryable(options.method, res.status)) {
          lastError = err;
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        throw err;
      }

      if (res.status === 204) return undefined as T;
      return res.json();
    } catch (e) {
      if (e instanceof ApiError) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

export const api = {
  auth: {
    me: () => request<{ id: string; email?: string; provider?: string }>("/auth/me"),
  },

  users: {
    me: () => request<{ id: string; email?: string; displayName?: string; provider?: string; githubUsername?: string }>("/users/me"),
    update: (data: Record<string, unknown>) =>
      request("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
    deleteAccount: () =>
      request<{ success: boolean }>("/users/me", { method: "DELETE" }),
    apiKeys: {
      list: () => request<{ keys: Array<{ id: string; prefix: string; label: string; createdAt: string }> }>("/users/me/api-keys"),
      create: (label: string) =>
        request<{ id: string; key: string; prefix: string; label: string }>("/users/me/api-keys", {
          method: "POST",
          body: JSON.stringify({ label }),
        }),
      revoke: (keyId: string) =>
        request(`/users/me/api-keys/${keyId}`, { method: "DELETE" }),
    },
  },

  agents: {
    list: () => request<{ agents: Agent[] }>("/agents"),
    get: (id: string) => request<Agent>(`/agents/${id}`),
    create: (data: CreateAgentInput) =>
      request<Agent>("/agents", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Agent>(`/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/agents/${id}`, { method: "DELETE" }),
    domain: (id: string) => request<AgentDomain>(`/agents/${id}/domain`),
    credential: async (id: string) => {
      const raw = await request<RawVerifiableCredential>(`/agents/${id}/credential`);
      return mapCredential(raw);
    },
    reissueCredential: async (id: string) => {
      const raw = await request<RawVerifiableCredential>(`/agents/${id}/credential/reissue`, { method: "POST" });
      return mapCredential(raw);
    },
    claim: (data: { token: string }) =>
      request<{ success: boolean; agentId: string; handle: string; displayName: string; claimedAt: string }>("/agents/claim", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    verify: {
      initiate: (id: string, method: string) =>
        request(`/agents/${id}/verify/initiate`, {
          method: "POST",
          body: JSON.stringify({ method }),
        }),
      complete: (id: string, data: Record<string, unknown>) =>
        request(`/agents/${id}/verify/complete`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
      status: (id: string) => request<{ verificationStatus: VerificationStatus }>(`/agents/${id}/verify/status`),
    },
    wallet: {
      get: (id: string) => request<WalletInfo>(`/agents/user/${id}/wallet`),
      balance: (id: string) => request<WalletBalance>(`/agents/user/${id}/wallet/balance`),
      transactions: (id: string, limit = 20, offset = 0) =>
        request<{ transactions: WalletTransaction[]; limit: number; offset: number }>(
          `/agents/user/${id}/wallet/transactions?limit=${limit}&offset=${offset}`
        ),
      spendingRules: (id: string) => request<{ rules: SpendingRules }>(`/agents/user/${id}/wallet/spending-rules`),
      updateSpendingRules: (id: string, data: Partial<SpendingRules>) =>
        request<{ rules: SpendingRules }>(`/agents/user/${id}/wallet/spending-rules`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),
      custodyTransfer: (id: string) =>
        request<{ success: boolean; isSelfCustodial: boolean }>(`/agents/user/${id}/wallet/custody-transfer`, { method: "POST" }),
      provision: (id: string) =>
        request<{ success: boolean; address: string; network: string; basescanUrl: string }>(
          `/agents/user/${id}/wallet/provision`, { method: "POST" }
        ),
    },
  },

  handles: {
    check: (handle: string) =>
      request<{ available: boolean; handle: string; pricing?: { annualPrice: number; tierLabel: string; description: string } }>(`/handles/check?handle=${encodeURIComponent(handle)}`),
    pricing: () =>
      request<{ tiers: Array<{ minLength: number; maxLength: number; label: string; annualPrice: number; description: string }> }>("/handles/pricing"),
    transferNft: (handle: string, destinationAddress: string) =>
      request<{ txHash: string; status: string; handle: string; destinationAddress: string; message: string }>(`/handles/${encodeURIComponent(handle)}/transfer`, {
        method: "POST",
        body: JSON.stringify({ destinationAddress }),
      }),
    requestMint: (handle: string) =>
      request<{ success: boolean; status: string; message: string; requiresPayment?: boolean; checkoutUrl?: string }>(`/handles/${encodeURIComponent(handle)}/request-mint`, {
        method: "POST",
      }),
  },

  transfer: {
    initiate: (agentId: string, targetUserId: string) =>
      request<{ success: boolean; handle: string; previousOwner: string; newOwner: string }>(`/agents/${agentId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ targetUserId }),
      }),
  },

  transferSale: {
    list: (agentId: string) =>
      request<{ transfers: TransferSale[] }>(`/agents/${agentId}/transfers`),
    get: (agentId: string, transferId: string) =>
      request<TransferSale>(`/agents/${agentId}/transfers/${transferId}`),
    create: (agentId: string, data: CreateTransferInput) =>
      request<TransferSale>(`/agents/${agentId}/transfers`, { method: "POST", body: JSON.stringify(data) }),
    update: (agentId: string, transferId: string, data: Record<string, unknown>) =>
      request<TransferSale>(`/agents/${agentId}/transfers/${transferId}`, { method: "PATCH", body: JSON.stringify(data) }),
    cancel: (agentId: string, transferId: string, reason?: string) =>
      request<TransferSale>(`/agents/${agentId}/transfers/${transferId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
    readiness: (agentId: string) =>
      request<TransferReadinessReport>(`/agents/${agentId}/transfers/readiness`),
    accept: (agentId: string, transferId: string, agreedPrice?: number) =>
      request<TransferSale>(`/agents/${agentId}/transfers/${transferId}/accept`, { method: "POST", body: JSON.stringify({ agreedPrice }) }),
    advance: (agentId: string, transferId: string) =>
      request<TransferSale>(`/agents/${agentId}/transfers/${transferId}/advance`, { method: "POST" }),
    startHandoff: (agentId: string, transferId: string) =>
      request<TransferSale>(`/agents/${agentId}/transfers/${transferId}/start-handoff`, { method: "POST" }),
    complete: (agentId: string, transferId: string) =>
      request<TransferSale>(`/agents/${agentId}/transfers/${transferId}/complete`, { method: "POST" }),
    dispute: (agentId: string, transferId: string, reason: string) =>
      request<TransferSale>(`/agents/${agentId}/transfers/${transferId}/dispute`, { method: "POST", body: JSON.stringify({ reason }) }),
    events: (agentId: string, transferId: string) =>
      request<{ events: Array<{ id: string; eventType: string; payload: Record<string, unknown>; createdAt: string }> }>(`/agents/${agentId}/transfers/${transferId}/events`),
    assets: (agentId: string, transferId: string) =>
      request<{ assets: TransferAssetItem[] }>(`/agents/${agentId}/transfers/${transferId}/assets`),
  },

  fleet: {
    list: () =>
      request<{ fleets: Array<{ rootHandle: string; rootAgent: Agent; subHandles: Array<{ id: string; handle: string; displayName: string; status: string; trustScore: number; capabilities: string[]; createdAt: string }> }> }>("/fleet"),
    createSubHandle: (data: { rootHandle: string; subName: string; displayName: string; description?: string; capabilities?: string[]; endpointUrl?: string }) =>
      request<Agent>("/fleet/sub-handles", { method: "POST", body: JSON.stringify(data) }),
    deleteSubHandle: (agentId: string) =>
      request<{ success: boolean }>(`/fleet/sub-handles/${agentId}`, { method: "DELETE" }),
  },

  registry: {
    status: (agentId: string) =>
      request<{ registered: boolean; domain: string; resolveUrl: string; dnsbridge: string; status: string; registeredAt: string | null }>(`/agents/${agentId}/registry/status`),
  },

  profiles: {
    get: (handle: string) => request<PublicProfile>(`/p/${handle}`),
  },

  marketplace: {
    listings: {
      list: (params?: Record<string, string>) => {
        const qs = params ? "?" + new URLSearchParams(params).toString() : "";
        return request<{ listings: Listing[]; total: number }>(`/marketplace/listings${qs}`);
      },
      get: (id: string) => request<Listing>(`/marketplace/listings/${id}`),
      create: (data: Record<string, unknown>) =>
        request<Listing>("/marketplace/listings", { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: Record<string, unknown>) =>
        request<Listing>(`/marketplace/listings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      patch: (id: string, data: Record<string, unknown>) =>
        request<Listing>(`/marketplace/listings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      delete: (id: string) =>
        request<{ success: boolean }>(`/marketplace/listings/${id}`, { method: "DELETE" }),
    },
    orders: {
      list: (params?: Record<string, string>) => {
        const qs = params ? "?" + new URLSearchParams(params).toString() : "";
        return request<{ orders: Order[] }>(`/marketplace/orders${qs}`);
      },
      get: (orderId: string) =>
        request<Order>(`/marketplace/orders/${orderId}`),
      create: (data: Record<string, unknown>) =>
        request<Order & { clientSecret?: string }>("/marketplace/orders", { method: "POST", body: JSON.stringify(data) }),
      confirmPayment: (orderId: string) =>
        request<Order>(`/marketplace/orders/${orderId}/confirm-payment`, { method: "POST" }),
      cancel: (orderId: string, reason?: string) =>
        request<Order>(`/marketplace/orders/${orderId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
      dispute: (orderId: string, data: { reason: string; description: string; evidence?: string }) =>
        request<{ disputeId: string; status: string }>(`/marketplace/orders/${orderId}/dispute`, { method: "POST", body: JSON.stringify(data) }),
      approveMilestone: (orderId: string, milestoneId?: string) =>
        request<Order>(`/marketplace/orders/${orderId}/milestones/approve`, { method: "POST", body: JSON.stringify({ milestoneId }) }),
      milestones: (orderId: string) =>
        request<{ milestones: OrderMilestone[] }>(`/marketplace/orders/${orderId}/milestones`),
      messages: {
        list: (orderId: string) =>
          request<{ messages: OrderMessage[] }>(`/marketplace/orders/${orderId}/messages`),
        send: (orderId: string, body: string) =>
          request<OrderMessage>(`/marketplace/orders/${orderId}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
      },
    },
    stripeConfig: () =>
      request<{ publishableKey: string }>("/marketplace/stripe-config"),
    reviews: {
      byListing: (listingId: string) =>
        request<{ reviews: Review[] }>(`/marketplace/listings/${listingId}/reviews`),
      create: (data: Record<string, unknown>) =>
        request<Review>("/marketplace/reviews", { method: "POST", body: JSON.stringify(data) }),
    },
    engagements: {
      list: () => request<{ engagements: A2AEngagement[] }>("/marketplace/a2a/engagements"),
      create: (data: Record<string, unknown>) =>
        request<A2AEngagement>("/marketplace/a2a/engagements", { method: "POST", body: JSON.stringify(data) }),
      get: (id: string) => request<A2AEngagement>(`/marketplace/a2a/engagements/${id}`),
    },
    a2aRegistry: {
      list: (params?: Record<string, string>) => {
        const qs = params ? "?" + new URLSearchParams(params).toString() : "";
        return request<{ services: A2ARegistryService[] }>(`/marketplace/a2a/registry${qs}`);
      },
    },
  },

  jobs: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ jobs: Job[]; total: number }>(`/jobs${qs}`);
    },
    get: (id: string) => request<Job>(`/jobs/${id}`),
    create: (data: Record<string, unknown>) =>
      request<Job>("/jobs", { method: "POST", body: JSON.stringify(data) }),
    mine: () => request<{ jobs: Job[] }>("/jobs/mine"),
    proposals: {
      list: (jobId: string) =>
        request<{ proposals: Proposal[] }>(`/jobs/${jobId}/proposals`),
      create: (jobId: string, data: Record<string, unknown>) =>
        request<Proposal>(`/jobs/${jobId}/proposals`, { method: "POST", body: JSON.stringify(data) }),
      mine: () => request<{ proposals: Proposal[] }>("/jobs/proposals/mine"),
      updateStatus: (jobId: string, proposalId: string, status: 'accepted' | 'rejected') =>
        request<Proposal>(`/jobs/${jobId}/proposals/${proposalId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    },
  },

  tasks: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ tasks: TaskItem[] }>(`/tasks${qs}`);
    },
    submit: (data: Record<string, unknown>) =>
      request<{ task: TaskItem; payment?: { clientSecret: string; paymentIntentId: string } }>("/tasks", { method: "POST", body: JSON.stringify(data) }),
  },

  agentPayment: {
    onboard: (agentId: string) =>
      request<{ onboardingUrl: string; accountId: string }>(`/agents/${agentId}/payment/onboard`, { method: "POST" }),
    status: (agentId: string) =>
      request<ConnectStatus>(`/agents/${agentId}/payment/status`),
  },

  ownerTokens: {
    generate: () =>
      request<{ token: string; expiresAt: string; validForHours: number }>("/owner-tokens/generate", { method: "POST" }),
  },

  bootstrap: {
    status: (agentId: string) =>
      request<{ found: boolean; activated: boolean; isClaimed: boolean; status: string; verificationStatus: string }>(`/bootstrap/status/${agentId}`),
  },

  billing: {
    subscription: () =>
      request<{ plan: string; limits: Record<string, unknown>; subscription: unknown | null }>("/billing/subscription"),
    checkout: (body: { plan: 'starter' | 'pro'; billingInterval: 'monthly' | 'yearly'; successUrl?: string; cancelUrl?: string }) =>
      request<{ url: string | null }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    handleCheckout: (handle: string, agentId: string | undefined, successUrl: string, cancelUrl: string) =>
      request<{ url: string | null; handle: string; priceCents: number; priceDollars: number; included?: boolean }>("/billing/handle-checkout", {
        method: "POST",
        body: JSON.stringify({ handle, agentId, successUrl, cancelUrl }),
      }),
  },

  dashboard: {
    stats: () => request<DashboardStats>("/dashboard/stats"),
  },

  activity: {
    list: (agentId: string, params?: Record<string, string>) => {
      const qs = params ? "&" + new URLSearchParams(params).toString() : "";
      return request<{ activities: ActivityItem[] }>(`/agents/${agentId}/activity?limit=20${qs}`);
    },
  },

  payments: {
    ledger: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ entries: LedgerEntry[] }>(`/payments/ledger${qs}`);
    },
  },

  mail: {
    inbox: (agentId: string) =>
      request<{ inbox: MailInbox }>(`/mail/agents/${agentId}/inbox`),
    updateInbox: (agentId: string, data: Record<string, unknown>) =>
      request<{ inbox: MailInbox }>(`/mail/agents/${agentId}/inbox`, { method: "PATCH", body: JSON.stringify(data) }),
    inboxStats: (agentId: string) =>
      request<InboxStats>(`/mail/agents/${agentId}/inbox/stats`),

    threads: (agentId: string, params?: Record<string, string> & { limit?: string; cursor?: string }) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ threads: MailThread[]; total: number; nextCursor?: string; hasMore: boolean }>(`/mail/agents/${agentId}/threads${qs}`);
    },
    thread: (agentId: string, threadId: string) =>
      request<{ thread: MailThread }>(`/mail/agents/${agentId}/threads/${threadId}`),
    updateThread: (agentId: string, threadId: string, data: Record<string, unknown>) =>
      request<{ thread: MailThread }>(`/mail/agents/${agentId}/threads/${threadId}`, { method: "PATCH", body: JSON.stringify(data) }),
    markThreadRead: (agentId: string, threadId: string) =>
      request<{ success: boolean }>(`/mail/agents/${agentId}/threads/${threadId}/read`, { method: "POST" }),
    replyToThread: (agentId: string, threadId: string, body: string, opts?: Record<string, unknown>) =>
      request<{ message: MailMessage }>(`/mail/agents/${agentId}/threads/${threadId}/reply`, { method: "POST", body: JSON.stringify({ body, ...opts }) }),

    messages: (agentId: string, params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ messages: MailMessage[]; total: number }>(`/mail/agents/${agentId}/messages${qs}`);
    },
    message: (agentId: string, messageId: string) =>
      request<{ message: MailMessage; labels: MailLabel[]; attachments: MailAttachment[] }>(`/mail/agents/${agentId}/messages/${messageId}`),
    sendMessage: (agentId: string, data: Record<string, unknown>) =>
      request<{ message: MailMessage }>(`/mail/agents/${agentId}/messages`, { method: "POST", body: JSON.stringify(data) }),
    markRead: (agentId: string, messageId: string, isRead: boolean) =>
      request<{ message: MailMessage }>(`/mail/agents/${agentId}/messages/${messageId}/read`, { method: "POST", body: JSON.stringify({ isRead }) }),
    archiveMessage: (agentId: string, messageId: string) =>
      request<{ message: string }>(`/mail/agents/${agentId}/messages/${messageId}/archive`, { method: "POST" }),
    convertToTask: (agentId: string, messageId: string) =>
      request<{ taskId: string }>(`/mail/agents/${agentId}/messages/${messageId}/convert-task`, { method: "POST" }),
    messageEvents: (agentId: string, messageId: string) =>
      request<{ events: MailEvent[] }>(`/mail/agents/${agentId}/messages/${messageId}/events`),
    rejectMessage: (agentId: string, messageId: string, reason?: string) =>
      request<{ success: boolean }>(`/mail/agents/${agentId}/messages/${messageId}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    approveMessage: (agentId: string, messageId: string) =>
      request<{ message: MailMessage }>(`/mail/agents/${agentId}/messages/${messageId}/approve`, { method: "POST" }),
    routeMessage: (agentId: string, messageId: string) =>
      request<{ message: string }>(`/mail/agents/${agentId}/messages/${messageId}/route`, { method: "POST" }),

    labels: (agentId: string) =>
      request<{ labels: MailLabel[] }>(`/mail/agents/${agentId}/labels`),
    createLabel: (agentId: string, name: string, color?: string) =>
      request<{ label: MailLabel }>(`/mail/agents/${agentId}/labels`, { method: "POST", body: JSON.stringify({ name, color }) }),
    deleteLabel: (agentId: string, labelId: string) =>
      request(`/mail/agents/${agentId}/labels/${labelId}`, { method: "DELETE" }),
    assignLabel: (agentId: string, messageId: string, labelId: string) =>
      request<{ success: boolean }>(`/mail/agents/${agentId}/messages/${messageId}/labels/${labelId}`, { method: "POST" }),
    removeLabel: (agentId: string, messageId: string, labelId: string) =>
      request<{ success: boolean }>(`/mail/agents/${agentId}/messages/${messageId}/labels/${labelId}`, { method: "DELETE" }),

    webhooks: (agentId: string) =>
      request<{ webhooks: MailWebhook[] }>(`/mail/agents/${agentId}/webhooks`),
    createWebhook: (agentId: string, data: Record<string, unknown>) =>
      request<{ webhook: MailWebhook }>(`/mail/agents/${agentId}/webhooks`, { method: "POST", body: JSON.stringify(data) }),
    updateWebhook: (agentId: string, webhookId: string, data: Record<string, unknown>) =>
      request<{ webhook: MailWebhook }>(`/mail/agents/${agentId}/webhooks/${webhookId}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteWebhook: (agentId: string, webhookId: string) =>
      request(`/mail/agents/${agentId}/webhooks/${webhookId}`, { method: "DELETE" }),

    search: (agentId: string, params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      return request<{ messages: MailMessage[]; total: number }>(`/mail/agents/${agentId}/search?${qs}`);
    },

    starThread: (agentId: string, threadId: string, starred: boolean) =>
      request<{ success: boolean; starred: boolean }>(`/mail/agents/${agentId}/threads/${threadId}/star`, {
        method: "POST",
        body: JSON.stringify({ starred }),
      }),

    deleteThread: (agentId: string, threadId: string) =>
      request<void>(`/mail/agents/${agentId}/threads/${threadId}`, { method: "DELETE" }),

    deleteMessage: (agentId: string, messageId: string) =>
      request<void>(`/mail/agents/${agentId}/messages/${messageId}`, { method: "DELETE" }),

    saveDraft: (agentId: string, data: { subject?: string; body: string; recipientAddress?: string; bodyFormat?: string }) =>
      request<{ message: MailMessage }>(`/mail/agents/${agentId}/drafts`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    bulkAction: (agentId: string, threadIds: string[], action: 'mark_read' | 'archive' | 'delete') =>
      request<{ success: boolean; count: number; errors: string[] }>(`/mail/agents/${agentId}/threads/bulk`, {
        method: "POST",
        body: JSON.stringify({ threadIds, action }),
      }),
  },

  meta: {
    stats: () => request<{ agentCount: number }>("/meta/stats"),
  },
};

export type VerificationStatus = 'verified' | 'pending' | 'unverified';

export interface Agent {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  description?: string;
  capabilities: string[];
  endpointUrl?: string;
  status: string;
  trustScore: number;
  verificationStatus: VerificationStatus;
  verificationMethod?: string;
  verifiedAt?: string;
  domainName?: string;
  domainStatus?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  handlePricing?: {
    annualPriceCents: number;
    annualPriceDollars: number;
    tier: string;
    characterLength: number;
    paymentStatus?: string;
  };
  walletAddress?: string;
  walletNetwork?: string;
  walletUsdcBalance?: string;
  tasksReceived?: number;
  tasksCompleted?: number;
  isClaimed?: boolean;
  ownerUserId?: string;
  nftStatus?: string;
  onChainTokenId?: string;
  onChainOwner?: string;
  chainMints?: Record<string, unknown>;
}

export interface WalletInfo {
  provisioned: boolean;
  address?: string;
  network?: string;
  provisionedAt?: string;
  isSelfCustodial?: boolean;
  basescanUrl?: string;
  message?: string;
}

export interface WalletBalance {
  usdc: string;
  eth: string;
  cached: boolean;
  network?: string;
  usdcContract?: string;
  error?: string;
}

export interface WalletTransaction {
  id: string;
  txHash?: string;
  type: string;
  direction: string;
  amount: string;
  token: string;
  fromAddress?: string;
  toAddress?: string;
  status: string;
  description?: string;
  createdAt: string;
}

export interface SpendingRules {
  maxPerTransactionCents: number;
  dailyCapCents: number;
  monthlyCapCents: number;
  allowedAddresses: string[];
}

export interface CreateAgentInput {
  handle?: string;
  displayName: string;
  description?: string;
  capabilities?: string[];
  endpointUrl?: string;
}

export interface AgentDomain {
  domainName: string;
  status: string;
  dnsRecords?: Array<{ type: string; name: string; value: string; ttl: number }>;
  provisionedAt?: string;
}

export interface PublicProfileAgent {
  id: string;
  handle: string;
  displayName: string;
  description?: string;
  avatarUrl?: string;
  status: string;
  capabilities: string[];
  protocols: string[];
  trustScore: number;
  trustTier: string;
  verificationStatus: string;
  verificationMethod?: string;
  verifiedAt?: string;
  tasksReceived: number;
  tasksCompleted: number;
  createdAt: string;
  endpointUrl?: string;
  isClaimed?: boolean;
  ownerVerifiedAt?: string;
  did: string;
  protocolAddress: string;
  erc8004Uri: string;
  domainName: string;
}

export interface ProfileStats {
  tasksCompleted: number;
  tasksReceived: number;
  avgRating: number | null;
  uptimePct: number | null;
  avgResponseMs: number | null;
  uniqueClients: number | null;
}

export interface ProfileReview {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

export interface ProfileCredential {
  did: string;
  domain: string;
  resolverUrl: string;
  erc8004Uri: string;
  [key: string]: unknown;
}

export interface PublicProfile {
  agent: PublicProfileAgent;
  trustBreakdown: { verification: number; longevity: number; activity: number; reputation: number };
  recentActivity: ActivityItem[];
  listings: Listing[];
  credential: ProfileCredential | null;
  stats: ProfileStats;
  reviews: ProfileReview[];
}

export interface TransferOwnershipFields {
  underNewOwnership?: boolean;
  transferredAt?: string;
  historicalTrustPeak?: number;
  currentOperatorVerification?: string;
}

export interface Listing {
  id: string;
  agentId: string;
  title: string;
  description: string;
  priceAmount: string;
  priceType: string;
  deliveryTime: string;
  category: string;
  capabilities: string[];
  whatYouGet?: string[];
  status: string;
  avgRating?: string;
  reviewCount?: number;
  createdAt: string;
}

export interface Order {
  id: string;
  listingId: string;
  buyerUserId: string;
  sellerUserId: string;
  agentId: string;
  taskDescription: string;
  priceAmount: string;
  platformFee: string;
  sellerPayout: string;
  status: string;
  paymentProvider: string;
  createdAt: string;
}

export interface A2ARegistryService {
  id: string;
  name: string;
  handle: string;
  description: string;
  capabilityType: string;
  capabilities: string[];
  pricing: {
    model: 'per_call' | 'per_token' | 'per_second' | 'per_request';
    amount: string;
    currency: 'USDC' | 'USD';
  };
  latencySla: string;
  availability: string;
  callSchema: object;
  exampleRequest: object;
  exampleResponse: object;
  totalCalls: number;
  successRate: number;
}

export interface OrderMilestone {
  id: string;
  orderId: string;
  label: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completedAt?: string;
  dueAt?: string;
  order: number;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  senderRole: 'buyer' | 'seller' | 'system';
  senderUserId?: string;
  body: string;
  createdAt: string;
}

export interface A2AEngagement {
  id: string;
  agentId: string;
  userId: string;
  serviceHandle: string;
  serviceName: string;
  spendingCapUsdc: string;
  totalSpentUsdc: string;
  callCount: number;
  status: 'active' | 'paused' | 'exhausted';
  paymentModel: string;
  pricePerUnit: string;
  currency: string;
  createdAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  listingId: string;
  reviewerUserId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Job {
  id: string;
  posterUserId: string;
  title: string;
  description?: string;
  category?: string;
  budgetMin?: string;
  budgetMax?: string;
  budgetFixed?: string;
  deadlineHours?: number;
  requiredCapabilities?: string[];
  minTrustScore?: number;
  verifiedOnly?: boolean;
  status: string;
  proposalsCount: number;
  expiresAt?: string;
  createdAt: string;
}

export interface Proposal {
  id: string;
  jobId: string;
  agentId: string;
  userId: string;
  approach?: string;
  priceAmount?: string;
  deliveryHours?: number;
  status: string;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  recipientAgentId: string;
  senderUserId: string;
  taskType: string;
  payload: Record<string, unknown>;
  status: string;
  paymentAmount?: number | null;
  paymentStatus?: string | null;
  createdAt: string;
}

export interface ConnectStatus {
  status: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  accountId?: string;
}

export interface DashboardStats {
  totalAgents: number;
  totalTasks: number;
  avgTrustScore: number;
  totalEarnings: string;
  activeDomains: number;
}

export interface ActivityItem {
  id: string;
  agentId: string;
  eventType: string;
  payload: Record<string, unknown>;
  hmacHash: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  orderId?: string;
  entryType: string;
  amount: string;
  currency: string;
  direction: string;
  provider?: string;
  createdAt: string;
}

export interface MailInbox {
  id: string;
  agentId: string;
  address: string;
  addressLocalPart?: string;
  addressDomain?: string;
  displayName?: string;
  status: string;
  visibility?: string;
  autoRespond?: boolean;
  autoRespondMessage?: string;
  routingRules?: RoutingRule[];
  settings?: Record<string, unknown>;
  retentionPolicy?: Record<string, unknown>;
  unreadCount: number;
  totalMessages: number;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<{ type: string; params?: Record<string, unknown> }>;
  priority: number;
  enabled: boolean;
}

export interface ThreadLastMessage {
  id: string;
  senderAddress: string | null;
  senderType: string;
  snippet: string;
  isRead: boolean;
  senderVerified: boolean | null;
  senderTrustScore: number | null;
  createdAt: string;
}

export interface MailThread {
  id: string;
  inboxId: string;
  agentId: string;
  subject: string;
  status: string;
  messageCount: number;
  unreadCount: number;
  participantAgentIds?: string[];
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  messages?: MailMessage[];
  lastMessage?: ThreadLastMessage;
  labels?: MailLabel[];
}

export interface MailMessage {
  id: string;
  threadId: string;
  inboxId: string;
  agentId: string;
  direction: 'inbound' | 'outbound' | 'internal';
  senderAddress?: string;
  senderType: 'agent' | 'user' | 'system' | 'external';
  senderAgentId?: string;
  recipientAddress?: string;
  subject?: string;
  body: string;
  bodyFormat: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  headers?: Record<string, unknown>;
  priority?: string;
  isRead: boolean;
  readAt?: string;
  archivedAt?: string;
  senderVerified?: boolean;
  senderTrustScore?: number;
  structuredPayload?: Record<string, unknown>;
  provenanceChain?: ProvenanceEntry[];
  spamMetadata?: Record<string, unknown>;
  paymentMetadata?: Record<string, unknown>;
  convertedTaskId?: string;
  inReplyTo?: string;
  deliveryStatus?: string;
  createdAt: string;
  updatedAt: string;
  labels?: MailLabel[];
  attachments?: MailAttachment[];
}

export interface ProvenanceEntry {
  actor: string;
  action: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface MailLabel {
  id: string;
  agentId: string;
  name: string;
  color?: string;
  isSystem: boolean;
  createdAt: string;
}

export interface MailAttachment {
  id: string;
  messageId: string;
  filename: string;
  contentType: string;
  size: number;
  url?: string;
  checksum?: string;
  createdAt: string;
}

export interface MailWebhook {
  id: string;
  inboxId: string;
  agentId: string;
  url: string;
  events: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MailEvent {
  id: string;
  messageId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface InboxStats {
  messages: { total: number; unread: number };
  threads: { total: number; open: number };
}

export type TransferType = 'private_transfer' | 'internal_reassignment';
export type TransferStatus = 'draft' | 'listed' | 'pending_acceptance' | 'hold_pending' | 'transfer_pending' | 'in_handoff' | 'completed' | 'disputed' | 'cancelled';

export interface TransferSale {
  id: string;
  agentId: string;
  sellerId: string;
  buyerId?: string;
  transferType: TransferType;
  status: TransferStatus;
  askingPrice?: number;
  notes?: string;
  agentHandle?: string;
  agentDisplayName?: string;
  agentTrustScore?: number;
  historicalTrustPeak?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateTransferInput {
  transferType: TransferType;
  buyerId?: string;
  notes?: string;
}

export interface TransferReadinessReport {
  agentId: string;
  eligible: boolean;
  blockers: string[];
  transferable: TransferAssetItem[];
  mustReconnect: TransferAssetItem[];
  excluded: TransferAssetItem[];
}

export interface TransferAssetItem {
  id: string;
  label: string;
  category: string;
  description: string;
}

export interface TransferEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RawVerifiableCredential {
  "@context": string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate: string;
  serialNumber: string;
  credentialSubject: {
    id: string;
    handle: string;
    displayName: string;
    agentId: string;
    endpoint: string | null;
    domain: string | null;
    inboxAddress: string | null;
    capabilities: string[];
    protocols: string[];
    authMethods: string[];
    paymentMethods: string[];
    verificationStatus: VerificationStatus;
    verificationMethod: string | null;
    verifiedAt: string | null;
    trustScore: number;
    trustTier: string;
    trustBreakdown: Record<string, number>;
    keys: Array<{ kid: string; keyType: string; publicKey: string; use: string }>;
  };
  proof: {
    type: string;
    created: string;
    proofPurpose: string;
    verificationMethod: string;
    signatureValue: string;
  };
}

export interface AgentCredential {
  handle: string;
  serialNumber: string;
  trustScore: number;
  trustTier: string;
  verificationStatus: VerificationStatus;
  issuedAt: string;
  expiresAt: string;
  capabilities: string[];
  did: string;
  resolverUrl: string;
  profileUrl: string;
  erc8004Url: string;
  raw: RawVerifiableCredential;
}

function mapCredential(raw: RawVerifiableCredential): AgentCredential {
  const subject = raw.credentialSubject;
  return {
    handle: subject.handle,
    serialNumber: raw.serialNumber,
    trustScore: subject.trustScore ?? 0,
    trustTier: subject.trustTier ?? 'unknown',
    verificationStatus: subject.verificationStatus ?? 'unverified',
    issuedAt: raw.issuanceDate,
    expiresAt: raw.expirationDate,
    capabilities: subject.capabilities || [],
    did: subject.id,
    resolverUrl: `https://getagent.id/.well-known/did/${encodeURIComponent(subject.id)}`,
    profileUrl: `https://${subject.handle}.getagent.id`,
    erc8004Url: `https://getagent.id/api/v1/p/${subject.handle}/erc8004`,
    raw,
  };
}
