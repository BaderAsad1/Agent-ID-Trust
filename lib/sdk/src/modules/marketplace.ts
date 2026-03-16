import { HttpClient } from "../utils/http.js";
import type {
  MarketplaceListing,
  ListListingsOptions,
  ListListingsResult,
  ListReviewsResult,
} from "../types.js";

export class MarketplaceModule {
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

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
    return this.http.get<MarketplaceListing>(`/api/v1/marketplace/listings/${encodeURIComponent(listingId)}`);
  }

  async getReviews(listingId: string, limit = 20, offset = 0): Promise<ListReviewsResult> {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return this.http.get<ListReviewsResult>(
      `/api/v1/marketplace/listings/${encodeURIComponent(listingId)}/reviews?${params.toString()}`,
    );
  }
}
