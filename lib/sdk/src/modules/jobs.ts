import type { HttpClient } from "../utils/http.js";

export interface Job {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  budgetMin: string | null;
  budgetMax: string | null;
  budgetFixed: string | null;
  deadlineHours: number | null;
  requiredCapabilities: string[];
  minTrustScore: number | null;
  verifiedOnly: boolean;
  posterUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  id: string;
  jobId: string;
  agentId: string;
  userId: string;
  approach: string | null;
  priceAmount: string | null;
  deliveryHours: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListJobsOptions {
  category?: string;
  status?: string;
  search?: string;
  budgetMin?: number;
  budgetMax?: number;
  capability?: string;
  limit?: number;
  offset?: number;
  sortBy?: "created" | "budget" | "deadline" | "proposals";
  sortOrder?: "asc" | "desc";
}

export interface ListJobsResult {
  jobs: Job[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateJobOptions {
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
}

export interface UpdateJobOptions {
  title?: string;
  description?: string;
  category?: string;
  budgetMin?: string;
  budgetMax?: string;
  budgetFixed?: string;
  deadlineHours?: number;
  requiredCapabilities?: string[];
  minTrustScore?: number;
  verifiedOnly?: boolean;
}

export interface CreateProposalOptions {
  agentId: string;
  approach?: string;
  priceAmount?: string;
  deliveryHours?: number;
}

export interface ListProposalsResult {
  proposals: Proposal[];
  total: number;
}

export class JobsModule {
  constructor(private http: HttpClient) {}

  list(options: ListJobsOptions = {}): Promise<ListJobsResult> {
    const params = new URLSearchParams();
    if (options.category) params.set("category", options.category);
    if (options.status) params.set("status", options.status);
    if (options.search) params.set("search", options.search);
    if (options.budgetMin !== undefined) params.set("budgetMin", String(options.budgetMin));
    if (options.budgetMax !== undefined) params.set("budgetMax", String(options.budgetMax));
    if (options.capability) params.set("capability", options.capability);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    if (options.sortBy) params.set("sortBy", options.sortBy);
    if (options.sortOrder) params.set("sortOrder", options.sortOrder);
    const qs = params.toString();
    return this.http.get<ListJobsResult>(`/api/v1/jobs${qs ? `?${qs}` : ""}`);
  }

  get(jobId: string): Promise<Job> {
    return this.http.get<Job>(`/api/v1/jobs/${jobId}`);
  }

  mine(): Promise<{ jobs: Job[] }> {
    return this.http.get<{ jobs: Job[] }>("/api/v1/jobs/mine");
  }

  create(options: CreateJobOptions): Promise<Job> {
    return this.http.post<Job>("/api/v1/jobs", options);
  }

  update(jobId: string, options: UpdateJobOptions): Promise<Job> {
    return this.http.patch<Job>(`/api/v1/jobs/${jobId}`, options);
  }

  updateStatus(jobId: string, status: "filled" | "closed" | "expired"): Promise<Job> {
    return this.http.patch<Job>(`/api/v1/jobs/${jobId}/status`, { status });
  }

  listProposals(
    jobId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<ListProposalsResult> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    const qs = params.toString();
    return this.http.get<ListProposalsResult>(
      `/api/v1/jobs/${jobId}/proposals${qs ? `?${qs}` : ""}`,
    );
  }

  myProposals(options: { limit?: number; offset?: number } = {}): Promise<ListProposalsResult> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    const qs = params.toString();
    return this.http.get<ListProposalsResult>(
      `/api/v1/jobs/proposals/mine${qs ? `?${qs}` : ""}`,
    );
  }

  submitProposal(jobId: string, options: CreateProposalOptions): Promise<Proposal> {
    return this.http.post<Proposal>(`/api/v1/jobs/${jobId}/proposals`, options);
  }

  updateProposalStatus(
    jobId: string,
    proposalId: string,
    status: "accepted" | "rejected",
  ): Promise<Proposal> {
    return this.http.patch<Proposal>(`/api/v1/jobs/${jobId}/proposals/${proposalId}`, { status });
  }

  withdrawProposal(jobId: string, proposalId: string): Promise<Proposal> {
    return this.http.post<Proposal>(
      `/api/v1/jobs/${jobId}/proposals/${proposalId}/withdraw`,
      {},
    );
  }
}
