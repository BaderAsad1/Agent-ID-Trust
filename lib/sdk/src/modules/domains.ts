import type { HttpClient } from "../utils/http.js";

export interface AgentDomain {
  id: string;
  agentId: string;
  hostname: string;
  status: string;
  sslStatus: string | null;
  verificationToken: string | null;
  provisionedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DomainStatus {
  hostname: string;
  status: string;
  sslStatus: string | null;
  dnsVerified: boolean;
  sslVerified: boolean;
  message: string | null;
}

export class DomainsModule {
  constructor(private http: HttpClient) {}

  get(agentId: string): Promise<AgentDomain> {
    return this.http.get<AgentDomain>(`/api/v1/agents/${agentId}/domain`);
  }

  getStatus(agentId: string): Promise<DomainStatus> {
    return this.http.get<DomainStatus>(`/api/v1/agents/${agentId}/domain/status`);
  }

  provision(agentId: string): Promise<AgentDomain> {
    return this.http.post<AgentDomain>(`/api/v1/agents/${agentId}/domain/provision`, {});
  }

  reprovision(agentId: string): Promise<AgentDomain> {
    return this.http.post<AgentDomain>(`/api/v1/agents/${agentId}/domain/reprovision`, {});
  }
}
