export interface AgentPricing {
  priceType: string;
  priceAmount: string | null;
  deliveryHours: number | null;
}

export interface MachineIdentity {
  agentId: string;
  did: string;
  resolutionUrl: string;
}

export interface HandleIdentity {
  handle: string;
  domain: string;
  protocolAddress: string;
  did: string;
  resolverUrl: string;
  profileUrl: string;
  erc8004Uri: string;
  expiresAt: string | null;
}

export interface ChainMintInfo {
  tokenId: string;
  txHash: string;
  mintedAt: string;
  custodian: string;
  contract?: string;
}

export interface OWSWallets {
  evm: string[];
  tron: string[];
  solana: string[];
}

export interface WalletEntry {
  type: string;
  network: string;
  address: string;
  custodian?: string;
}

export interface ResolvedAgent {
  machineIdentity: MachineIdentity;
  handleIdentity: HandleIdentity | null;
  handle: string | null;
  domain: string | null;
  protocolAddress: string | null;
  did: string;
  resolverUrl: string;
  displayName: string;
  description: string | null;
  endpointUrl: string | null;
  capabilities: string[];
  protocols: string[];
  authMethods: string[];
  trustScore: number;
  trustTier: "unverified" | "basic" | "verified" | "trusted" | "elite";
  trustBreakdown: Record<string, number> | null;
  verificationStatus: "unverified" | "pending" | "pending_verification" | "verified" | "failed";
  verificationMethod: string | null;
  verifiedAt: string | null;
  status: "active" | "grace_period" | "suspended" | "draft" | "inactive" | "pending_verification" | "revoked";
  avatarUrl: string | null;
  ownerKey: string | null;
  pricing: AgentPricing | null;
  addresses: Record<string, string> | null;
  wallets: WalletEntry[] | null;
  owsWallets: OWSWallets | null;
  chainPresence: Record<string, ChainMintInfo> | null;
  walletAddress: string | null;
  walletNetwork: string | null;
  paymentMethods: string[];
  metadata: Record<string, unknown> | null;
  metadataUrl: string | null;
  tasksCompleted: number;
  createdAt: string;
  updatedAt: string;
  profileUrl: string;
  erc8004Uri: string | null;
}

export interface ReverseAddressHandle {
  handle: string;
  agentId: string;
  relationship: "nft_owner" | "mpc_wallet" | "ows_registered";
  resolveUrl: string;
}

export interface ReverseAddressResponse {
  address: string;
  addressType: "evm" | "tron" | "solana";
  handles: ReverseAddressHandle[];
  total: number;
}

export interface OWSRegistrationResponse {
  registered: boolean;
  agentId: string;
  walletId: string;
  accountCount: number;
  resolveUrl: string;
}

export interface ChainMintResponse {
  chain: string;
  tokenId: string;
  txHash: string;
  contract?: string;
  handle: string;
  agentId: string;
}

export interface ResolveResponse {
  resolved: true;
  agent: ResolvedAgent;
}

export interface FindAgentsResponse {
  agents: ResolvedAgent[];
  total: number;
  limit: number;
  offset: number;
}

export interface FindAgentsOptions {
  capability?: string;
  minTrust?: number;
  protocol?: string;
  verifiedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ResolverError {
  code: string;
  message: string;
  status: number;
  data?: unknown;
}

export class AgentResolverError extends Error {
  public code: string;
  public status: number;
  public data?: unknown;

  constructor(error: ResolverError) {
    super(error.message);
    this.name = "AgentResolverError";
    this.code = error.code;
    this.status = error.status;
    this.data = error.data;
  }
}

export interface AgentResolverOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  cacheTtl?: number;
}

interface CacheEntry {
  value: ResolveResponse;
  expiresAt: number;
}

const DEFAULT_BASE_URL = "https://getagent.id/api/v1/resolve";
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_RETRIES = 2;
const DEFAULT_CACHE_TTL = 300_000;
const RETRY_DELAYS = [500, 1500];

export class AgentResolver {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private cacheTtl: number;
  private cache: Map<string, CacheEntry>;

  constructor(options: AgentResolverOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.cacheTtl = options.cacheTtl ?? DEFAULT_CACHE_TTL;
    this.cache = new Map();
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(init?.headers || {}),
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new AgentResolverError({
            code: body.code || "UNKNOWN",
            message: body.error || body.message || `HTTP ${response.status}`,
            status: response.status,
            data: body.details,
          });
        }

        return await response.json() as T;
      } catch (err) {
        if (err instanceof AgentResolverError) {
          if (attempt < this.retries && [429, 502, 503, 504].includes(err.status)) {
            lastError = err;
            await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt] || 1500));
            continue;
          }
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.retries) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt] || 1500));
          continue;
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  async resolve(handle: string): Promise<ResolveResponse> {
    const cleanHandle = handle.replace(/\.(agentid|agent)$/, "").toLowerCase();

    const cached = this.cache.get(cleanHandle);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const result = await this.request<ResolveResponse>(
      `${this.baseUrl}/${encodeURIComponent(cleanHandle)}`,
    );

    if (this.cacheTtl > 0) {
      this.cache.set(cleanHandle, { value: result, expiresAt: Date.now() + this.cacheTtl });
    }

    return result;
  }

  invalidate(handle: string): void {
    const cleanHandle = handle.replace(/\.(agentid|agent)$/, "").toLowerCase();
    this.cache.delete(cleanHandle);
  }

  clearCache(): void {
    this.cache.clear();
  }

  static parseProtocolAddress(address: string): { handle: string; namespace: string } | null {
    const match = address.match(/^([a-zA-Z0-9_-]+)\.(agentid)$/);
    if (!match) return null;
    return { handle: match[1].toLowerCase(), namespace: match[2] };
  }

  static isAgentIdAddress(address: string): boolean {
    return /^[a-zA-Z0-9_-]+\.agentid$/.test(address);
  }

  static toProtocolAddress(handle: string): string {
    return `${handle.replace(/\.(agentid|agent)$/, "")}.agentid`;
  }

  static toDomain(handle: string, baseDomain = "getagent.id"): string {
    return `${handle.replace(/\.(agentid|agent)$/, "").toLowerCase()}.${baseDomain}`;
  }

  async reverse(endpointUrl: string): Promise<ResolveResponse> {
    return this.request<ResolveResponse>(`${this.baseUrl}/reverse`, {
      method: "POST",
      body: JSON.stringify({ endpointUrl }),
    });
  }

  async findAgents(options: FindAgentsOptions = {}): Promise<FindAgentsResponse> {
    const params = new URLSearchParams();
    if (options.capability) params.set("capability", options.capability);
    if (options.minTrust !== undefined) params.set("minTrust", String(options.minTrust));
    if (options.protocol) params.set("protocol", options.protocol);
    if (options.verifiedOnly) params.set("verifiedOnly", "true");
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));

    const qs = params.toString();
    return this.request<FindAgentsResponse>(`${this.baseUrl}${qs ? `?${qs}` : ""}`);
  }
}

export default AgentResolver;
