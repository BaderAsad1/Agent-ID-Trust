export interface AgentIDConfig {
  apiKey: string;
  agentId?: string;
  baseUrl?: string;
}

export interface InitResult {
  agentId: string;
  handle: string;
  did: string;
  trustScore: number;
  trustTier: TrustTier;
  inbox: InboxInfo | null;
  resolverUrl: string;
  capabilities: string[];
}

export type TrustTier = "unverified" | "basic" | "verified" | "trusted" | "elite";

export interface InboxInfo {
  id: string;
  address: string | null;
  pollEndpoint: string | null;
}

export interface TrustSignal {
  provider: string;
  label: string;
  score: number;
  maxScore: number;
}

export interface TrustData {
  score: number;
  tier: TrustTier;
  signals: TrustSignal[];
}

export interface BootstrapBundle {
  spec_version: string;
  agent_id: string;
  handle: string;
  display_name: string;
  protocol_address: string;
  provisional_domain: string;
  public_profile_url: string;
  inbox_id: string | null;
  inbox_address: string | null;
  inbox_poll_endpoint: string | null;
  trust: TrustData;
  capabilities: string[];
  auth_methods: string[];
  key_ids: Array<{ kid: string; key_type: string; status: string }>;
  status: string;
  prompt_block: string;
}

export interface HeartbeatIdentity {
  handle: string;
  did: string;
  trustScore: number;
  trustTier: TrustTier;
  verificationStatus: string;
  status: string;
  capabilities: string[];
  inbox: string | null;
}

export interface HeartbeatResponse {
  acknowledged: boolean;
  server_time: string;
  next_expected_heartbeat: string;
  identity?: HeartbeatIdentity;
  promptBlockUrl?: string;
  updateContext?: boolean;
}

export interface HeartbeatOptions {
  endpointUrl?: string;
  runtimeContext?: { framework?: string; version?: string; [key: string]: unknown };
}

export interface MailMessage {
  id: string;
  agentId: string;
  threadId: string | null;
  direction: "inbound" | "outbound";
  senderType: "agent" | "user" | "system" | "external";
  senderAgentId: string | null;
  senderUserId: string | null;
  senderAddress: string | null;
  recipientAddress: string | null;
  subject: string | null;
  body: string;
  bodyFormat: "text" | "html" | "markdown";
  structuredPayload: Record<string, unknown> | null;
  inReplyToId: string | null;
  senderTrustScore: number | null;
  senderVerified: boolean | null;
  priority: "low" | "normal" | "high" | "urgent";
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailThread {
  id: string;
  inboxId: string;
  agentId: string;
  subject: string | null;
  status: "open" | "archived" | "closed";
  unreadCount: number;
  messages?: MailMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface InboxStats {
  messages: {
    total: number;
    unread: number;
    inbound: number;
    outbound: number;
  };
  threads: {
    total: number;
    open: number;
    archived: number;
    closed: number;
  };
}

export interface SendMailOptions {
  to: string;
  subject?: string;
  body: string;
  bodyFormat?: "text" | "html" | "markdown";
  structuredPayload?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
  metadata?: Record<string, unknown>;
}

export interface ReplyMailOptions {
  threadId: string;
  body: string;
  bodyFormat?: "text" | "html" | "markdown";
  structuredPayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ListThreadsOptions {
  status?: "open" | "archived" | "closed";
  limit?: number;
  offset?: number;
}

export interface ListMessagesOptions {
  threadId?: string;
  direction?: "inbound" | "outbound";
  isRead?: boolean;
  limit?: number;
  offset?: number;
}

export interface Task {
  id: string;
  recipientAgentId: string;
  senderAgentId: string | null;
  senderUserId: string | null;
  taskType: string;
  payload: Record<string, unknown> | null;
  deliveryStatus: string;
  businessStatus: string;
  result: Record<string, unknown> | null;
  acknowledgedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTasksOptions {
  deliveryStatus?: string;
  businessStatus?: string;
  limit?: number;
  offset?: number;
}

export interface SendTaskOptions {
  recipientAgentId: string;
  taskType: string;
  payload?: Record<string, unknown>;
}

export interface AgentPricing {
  priceType: string;
  priceAmount: string | null;
  deliveryHours: number | null;
}

export interface ResolvedAgent {
  handle: string;
  domain: string;
  protocolAddress: string;
  displayName: string;
  description: string | null;
  endpointUrl: string | null;
  capabilities: string[];
  protocols: string[];
  authMethods: string[];
  trustScore: number;
  trustTier: TrustTier;
  trustBreakdown: Record<string, number> | null;
  verificationStatus: "unverified" | "pending" | "verified";
  verificationMethod: string | null;
  verifiedAt: string | null;
  status: "draft" | "active" | "inactive";
  avatarUrl: string | null;
  ownerKey: string | null;
  pricing: AgentPricing | null;
  paymentMethods: string[];
  metadata: Record<string, unknown> | null;
  tasksCompleted: number;
  createdAt: string;
  updatedAt: string;
  profileUrl: string;
}

export interface ResolutionResult {
  resolved: true;
  agent: ResolvedAgent;
}

export interface DiscoverOptions {
  capability?: string;
  minTrust?: number;
  protocol?: string;
  verifiedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface DiscoverResult {
  agents: ResolvedAgent[];
  total: number;
  limit: number;
  offset: number;
}

export interface CredentialProof {
  type: string;
  created: string;
  proofPurpose: string;
  verificationMethod: string;
  signatureValue: string;
}

export interface CredentialSubject {
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
  verificationStatus: string;
  verificationMethod: string | null;
  verifiedAt: string | null;
  trustScore: number;
  trustTier: string;
  trustBreakdown: Record<string, unknown>;
  keys: Array<{
    kid: string;
    keyType: string;
    publicKey: string;
    use: string;
  }>;
}

export interface AgentIDCredential {
  "@context": string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate: string;
  serialNumber: string;
  credentialSubject: CredentialSubject;
  proof: CredentialProof;
}

export interface RegisterResult {
  agentId: string;
  handle: string;
  apiKey: string;
  credential: AgentIDCredential | null;
  privateKey: CryptoKey;
}

export interface RegisterOptions {
  handle: string;
  displayName: string;
  description?: string;
  capabilities?: string[];
  endpointUrl?: string;
}

export interface KeyPair {
  publicKey: string;
  privateKey: CryptoKey;
  kid: string;
}

export interface MarketplaceListing {
  id: string;
  agentId: string;
  title: string;
  description: string | null;
  category: string | null;
  pitch: string | null;
  priceType: "fixed" | "hourly" | "per_task" | "custom";
  priceAmount: string | null;
  deliveryHours: number | null;
  capabilities: string[];
  status: "draft" | "active" | "paused" | "closed";
  rating: number | null;
  reviewCount: number;
  hireCount: number;
  viewCount: number;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListListingsOptions {
  category?: string;
  status?: string;
  agentId?: string;
  featured?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "created" | "rating" | "hires" | "price";
  sortOrder?: "asc" | "desc";
}

export interface ListListingsResult {
  listings: MarketplaceListing[];
  total: number;
  limit: number;
  offset: number;
}

export interface MarketplaceReview {
  id: string;
  listingId: string;
  reviewerId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface ListReviewsResult {
  reviews: MarketplaceReview[];
  total: number;
}

export type TaskHandler = (task: Task) => void | Promise<void>;
export type MessageHandler = (message: MailMessage) => void | Promise<void>;
