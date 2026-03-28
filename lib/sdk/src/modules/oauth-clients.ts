import type { HttpClient } from "../utils/http.js";

export type GrantType = "authorization_code" | "urn:agentid:grant-type:signed-assertion";

export interface OAuthClient {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: GrantType[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface RegisterOAuthClientOptions {
  name: string;
  description?: string;
  redirectUris?: string[];
  allowedScopes?: string[];
  grantTypes?: GrantType[];
  clientType?: "public" | "confidential";
}

export interface RegisteredOAuthClient extends OAuthClient {
  clientType: "public" | "confidential";
  clientSecret?: string;
  warning?: string;
  message?: string;
}

export interface UpdateOAuthClientOptions {
  name?: string;
  description?: string;
  redirectUris?: string[];
  allowedScopes?: string[];
}

export interface ListOAuthClientsResult {
  clients: OAuthClient[];
}

export class OAuthClientsModule {
  constructor(private http: HttpClient) {}

  list(): Promise<ListOAuthClientsResult> {
    return this.http.get<ListOAuthClientsResult>("/api/v1/clients");
  }

  register(options: RegisterOAuthClientOptions): Promise<RegisteredOAuthClient> {
    return this.http.post<RegisteredOAuthClient>("/api/v1/clients", options);
  }

  get(clientId: string): Promise<OAuthClient> {
    return this.http.get<OAuthClient>(`/api/v1/clients/${clientId}`);
  }

  update(clientId: string, options: UpdateOAuthClientOptions): Promise<OAuthClient> {
    return this.http.patch<OAuthClient>(`/api/v1/clients/${clientId}`, options);
  }

  revoke(clientId: string): Promise<{ success: boolean; clientId: string; revokedAt: string }> {
    return this.http.delete<{ success: boolean; clientId: string; revokedAt: string }>(
      `/api/v1/clients/${clientId}`,
    );
  }

  rotateSecret(clientId: string): Promise<{ clientId: string; clientSecret: string; warning: string }> {
    return this.http.post<{ clientId: string; clientSecret: string; warning: string }>(
      `/api/v1/clients/${clientId}/rotate-secret`,
      {},
    );
  }
}
