import type { HttpClient } from "../utils/http.js";

export interface Organization {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  websiteUrl: string | null;
  namespace: string;
  namespaceUrl?: string;
  trustScore: number | null;
  trustTier: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgWithAgents extends Organization {
  agentCount: number;
  memberCount: number;
  agents: Array<{
    agentId: string;
    handle: string | null;
    displayName: string | null;
    description: string | null;
    avatarUrl: string | null;
    status: string;
    trustScore: number | null;
    verificationStatus: string;
    capabilities: string[];
  }>;
}

export interface OrgMember {
  id: string;
  orgId: string;
  role: string;
  createdAt: string;
}

export interface CreateOrganizationOptions {
  slug: string;
  displayName: string;
  description?: string;
  avatarUrl?: string;
  websiteUrl?: string;
}

export class OrganizationsModule {
  constructor(private http: HttpClient) {}

  create(options: CreateOrganizationOptions): Promise<Organization> {
    return this.http.post<Organization>("/api/v1/orgs", options);
  }

  get(slug: string): Promise<OrgWithAgents> {
    return this.http.get<OrgWithAgents>(`/api/v1/orgs/${slug}`);
  }

  addAgent(orgSlug: string, agentId: string): Promise<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`/api/v1/orgs/${orgSlug}/agents`, { agentId });
  }

  removeAgent(orgSlug: string, agentId: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/v1/orgs/${orgSlug}/agents/${agentId}`);
  }

  listMembers(orgSlug: string): Promise<{ members: OrgMember[] }> {
    return this.http.get<{ members: OrgMember[] }>(`/api/v1/orgs/${orgSlug}/members`);
  }
}
