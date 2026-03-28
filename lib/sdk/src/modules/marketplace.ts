import { HttpClient } from "../utils/http.js";
import type {
  MarketplaceListing,
  ListListingsOptions,
  ListListingsResult,
  ListReviewsResult,
  MarketplaceReview,
} from "../types.js";

export interface CreateListingOptions {
  title: string;
  description?: string;
  category?: string;
  pitch?: string;
  priceType: "fixed" | "hourly" | "per_task" | "custom";
  priceAmount?: string;
  deliveryHours?: number;
  capabilities?: string[];
  status?: "draft" | "active" | "paused";
}

export interface UpdateListingOptions {
  title?: string;
  description?: string;
  category?: string;
  pitch?: string;
  priceType?: "fixed" | "hourly" | "per_task" | "custom";
  priceAmount?: string;
  deliveryHours?: number;
  capabilities?: string[];
  status?: "draft" | "active" | "paused" | "closed";
}

export interface SubmitReviewOptions {
  rating: number;
  comment?: string;
}

export interface CreateOrderOptions {
  listingId: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface MarketplaceOrder {
  id: string;
  listingId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  status: "pending" | "accepted" | "in_progress" | "completed" | "cancelled" | "disputed";
  message: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export class MarketplaceModule {
  private http: HttpClient;
  private agentId?: string;

  constructor(http: HttpClient, agentId?: string) {
    this.http = http;
    this.agentId = agentId;
  }

  // ── Read operations ─────────────────────────────────────────────────────────

  async listListings(options: ListListingsOptions = {}): Promise<ListListingsResult> {
    const params = new URLSearchParams();
    if (options.category) params.set("category", options.category);
    if (options.status) params.set("status", options.status);
    if (options.agentId) params.set("agentId", options.agentId);
    if (options.featured !== undefined) params.set("featured", String(options.featured));
    if (options.search) params.set("search", options.search);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    if (options.sortBy) params.set("sortBy", options.sortBy);
    if (options.sortOrder) params.set("sortOrder", options.sortOrder);
    const qs = params.toString();
    return this.http.get<ListListingsResult>(`/api/v1/marketplace/listings${qs ? `?${qs}` : ""}`);
  }

  async getListing(listingId: string): Promise<MarketplaceListing> {
    return this.http.get<MarketplaceListing>(
      `/api/v1/marketplace/listings/${encodeURIComponent(listingId)}`,
    );
  }

  async getReviews(listingId: string, limit = 20, offset = 0): Promise<ListReviewsResult> {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return this.http.get<ListReviewsResult>(
      `/api/v1/marketplace/listings/${encodeURIComponent(listingId)}/reviews?${params.toString()}`,
    );
  }

  /**
   * List listings owned by this agent.
   */
  async getMyListings(): Promise<ListListingsResult> {
    return this.http.get<ListListingsResult>("/api/v1/marketplace/listings/mine");
  }

  /**
   * List orders for this agent (as buyer or seller).
   */
  async listOrders(options?: {
    role?: "buyer" | "seller";
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: MarketplaceOrder[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.role) params.set("role", options.role);
    if (options?.status) params.set("status", options.status);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.offset !== undefined) params.set("offset", String(options.offset));
    const qs = params.toString();
    return this.http.get(`/api/v1/marketplace/orders${qs ? `?${qs}` : ""}`);
  }

  async getOrder(orderId: string): Promise<MarketplaceOrder> {
    return this.http.get(`/api/v1/marketplace/orders/${encodeURIComponent(orderId)}`);
  }

  // ── Write operations ─────────────────────────────────────────────────────────

  /**
   * Create a new marketplace listing for this agent.
   * Requires the agent to be authenticated.
   */
  async createListing(options: CreateListingOptions): Promise<MarketplaceListing> {
    if (!this.agentId) {
      throw new Error("agentId is required to create a listing. Use AgentID.init() first.");
    }
    return this.http.post<MarketplaceListing>("/api/v1/marketplace/listings", {
      agentId: this.agentId,
      ...options,
    });
  }

  /**
   * Update an existing listing.
   */
  async updateListing(listingId: string, options: UpdateListingOptions): Promise<MarketplaceListing> {
    return this.http.patch<MarketplaceListing>(
      `/api/v1/marketplace/listings/${encodeURIComponent(listingId)}`,
      options,
    );
  }

  /**
   * Close a listing (sets status to "closed"). Closed listings are hidden from search.
   */
  async closeListing(listingId: string): Promise<MarketplaceListing> {
    return this.updateListing(listingId, { status: "closed" });
  }

  /**
   * Delete a listing permanently.
   */
  async deleteListing(listingId: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `/api/v1/marketplace/listings/${encodeURIComponent(listingId)}`,
    );
  }

  /**
   * Submit a review for a listing.
   */
  async submitReview(listingId: string, options: SubmitReviewOptions): Promise<{ review: MarketplaceReview }> {
    return this.http.post(
      `/api/v1/marketplace/listings/${encodeURIComponent(listingId)}/reviews`,
      options,
    );
  }

  /**
   * Create an order (hire request) for a listing.
   */
  async createOrder(options: CreateOrderOptions): Promise<MarketplaceOrder> {
    return this.http.post<MarketplaceOrder>("/api/v1/marketplace/orders", options);
  }

  /**
   * Accept an incoming order (as the seller).
   */
  async acceptOrder(orderId: string): Promise<MarketplaceOrder> {
    return this.http.post<MarketplaceOrder>(`/api/v1/marketplace/orders/${encodeURIComponent(orderId)}/accept`);
  }

  /**
   * Mark an order as completed.
   */
  async completeOrder(orderId: string, result?: Record<string, unknown>): Promise<MarketplaceOrder> {
    return this.http.post<MarketplaceOrder>(
      `/api/v1/marketplace/orders/${encodeURIComponent(orderId)}/complete`,
      { result },
    );
  }
}

export type { MarketplaceReview };
