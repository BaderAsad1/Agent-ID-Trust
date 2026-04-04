const BASE = "/api/v1";

const STORAGE_KEY = 'agentid_user_id';

declare global {
  interface Window {
    __agentid_uid?: string | null;
  }
}

export function setCurrentUserId(userId: string | null) {
  window.__agentid_uid = userId;
  try {
    if (userId) {
      localStorage.setItem(STORAGE_KEY, userId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) window.__agentid_uid = stored;
} catch {}

export function getCurrentUserId(): string | null {
  if (window.__agentid_uid) return window.__agentid_uid;
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

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

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  const uid = getCurrentUserId();
  if (uid) {
    headers["X-Replit-User-Id"] = uid;
    headers["X-AgentID-User-Id"] = uid;
  }

  let lastError: ApiError | Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers,
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
    me: () => request<{ id: string; replitUserId: string; email?: string }>("/auth/me"),
  },

  users: {
    me: () => request<{ id: string; replitUserId: string; email?: string; displayName?: string }>("/users/me"),
    update: (data: Record<string, unknown>) =>
      request("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
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
      status: (id: string) => request<{ verificationStatus: string }>(`/agents/${id}/verify/status`),
    },
  },

  handles: {
    check: (handle: string) =>
      request<{ available: boolean; handle: string }>(`/handles/check?handle=${encodeURIComponent(handle)}`),
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
    },
    orders: {
      list: (params?: Record<string, string>) => {
        const qs = params ? "?" + new URLSearchParams(params).toString() : "";
        return request<{ orders: Order[] }>(`/marketplace/orders${qs}`);
      },
      create: (data: Record<string, unknown>) =>
        request<Order>("/marketplace/orders", { method: "POST", body: JSON.stringify(data) }),
    },
    reviews: {
      byListing: (listingId: string) =>
        request<{ reviews: Review[] }>(`/marketplace/listings/${listingId}/reviews`),
      create: (data: Record<string, unknown>) =>
        request<Review>("/marketplace/reviews", { method: "POST", body: JSON.stringify(data) }),
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
    },
  },

  tasks: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ tasks: TaskItem[] }>(`/tasks${qs}`);
    },
    submit: (data: Record<string, unknown>) =>
      request<TaskItem>("/tasks", { method: "POST", body: JSON.stringify(data) }),
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

    threads: (agentId: string, params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ threads: MailThread[]; total: number }>(`/mail/agents/${agentId}/threads${qs}`);
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
  },
};

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
  verificationStatus: string;
  verificationMethod?: string;
  verifiedAt?: string;
  domainName?: string;
  domainStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentInput {
  handle: string;
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

export interface PublicProfile {
  agent: Agent;
  listings?: Listing[];
  recentActivity?: ActivityItem[];
  trustBreakdown?: { verification: number; longevity: number; activity: number; reputation: number };
}

export interface Listing {
  id: string;
  agentId: string;
  title: string;
  description: string;
  priceAmount: string;
  priceUnit: string;
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
  createdAt: string;
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
