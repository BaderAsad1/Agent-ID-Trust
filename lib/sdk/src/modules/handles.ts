import type { HttpClient } from "../utils/http.js";

export interface HandleAvailability {
  handle: string;
  available: boolean;
  reason?: string;
  tier: "premium" | "standard" | "basic" | "reserved";
  priceDollars: number;
  priceYearly: number;
  isFree: boolean;
  onChainMintPrice?: number;
  onChainMintPriceDollars?: number;
  includesOnChainMint?: boolean;
}

export interface OwnedHandle {
  handle: string;
  agentId: string;
  displayName: string;
  status: "active" | "pending" | "expired";
  nftStatus: "none" | "pending_mint" | "pending_claim" | "minted";
  paidThrough: string | null;
  createdAt: string;
}

export interface ListHandlesResult {
  handles: OwnedHandle[];
  total: number;
}

export interface RequestMintResult {
  success: boolean;
  requiresPayment: boolean;
  checkoutUrl?: string;
  nftStatus?: string;
  message?: string;
}

export interface HandleCheckOptions {
  agentId?: string;
}

export class HandleModule {
  private http: HttpClient;
  private agentId: string;

  constructor(http: HttpClient, agentId: string) {
    this.http = http;
    this.agentId = agentId;
  }

  /**
   * Check if a handle is available and get pricing info.
   * No authentication required for basic availability check.
   */
  async check(handle: string, options?: HandleCheckOptions): Promise<HandleAvailability> {
    const params = new URLSearchParams();
    params.set("handle", handle.toLowerCase().replace(/\.agentid$/i, ""));
    if (options?.agentId) params.set("agentId", options.agentId);
    const data = await this.http.get<{
      handle: string;
      available: boolean;
      reason?: string;
      tier?: string;
      priceDollars?: number;
      priceYearly?: number;
      isFree?: boolean;
      onChainMintPrice?: number;
      onChainMintPriceDollars?: number;
      includesOnChainMint?: boolean;
    }>(`/api/v1/handles/check?${params.toString()}`);
    return {
      handle: data.handle,
      available: data.available,
      reason: data.reason,
      tier: (data.tier as HandleAvailability["tier"]) ?? "basic",
      priceDollars: data.priceDollars ?? 0,
      priceYearly: data.priceYearly ?? 0,
      isFree: data.isFree ?? false,
      onChainMintPrice: data.onChainMintPrice,
      onChainMintPriceDollars: data.onChainMintPriceDollars,
      includesOnChainMint: data.includesOnChainMint,
    };
  }

  /**
   * List handles owned by this agent.
   */
  async list(options?: { limit?: number; offset?: number }): Promise<ListHandlesResult> {
    const params = new URLSearchParams();
    params.set("agentId", this.agentId);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.offset !== undefined) params.set("offset", String(options.offset));
    return this.http.get<ListHandlesResult>(`/api/v1/handles?${params.toString()}`);
  }

  /**
   * Request on-chain NFT mint for a handle owned by this agent.
   * For standard handles (5+ chars): creates a Stripe checkout for the on-chain mint fee.
   * For premium handles (3-4 chars): queues the mint immediately (included in purchase).
   */
  async requestMint(handle: string): Promise<RequestMintResult> {
    return this.http.post<RequestMintResult>(
      `/api/v1/handles/${encodeURIComponent(handle.replace(/\.agentid$/i, ""))}/request-mint`,
      { agentId: this.agentId },
    );
  }

  /**
   * Get the NFT/mint status for a specific handle.
   */
  async getStatus(handle: string): Promise<{
    handle: string;
    nftStatus: string;
    contractAddress: string | null;
    tokenId: string | null;
    mintedAt: string | null;
  }> {
    const cleanHandle = handle.replace(/\.agentid$/i, "");
    return this.http.get(`/api/v1/handles/${encodeURIComponent(cleanHandle)}/status`);
  }
}
