import type { HttpClient } from "../utils/http.js";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[] | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKey {
  key: string;
}

export interface CreateApiKeyOptions {
  name: string;
  scopes?: string[];
  sandbox?: boolean;
}

export interface ListApiKeysResult {
  keys: ApiKey[];
}

export class ApiKeysModule {
  constructor(private http: HttpClient) {}

  create(options: CreateApiKeyOptions): Promise<CreatedApiKey> {
    return this.http.post<CreatedApiKey>("/api/v1/api-keys", options);
  }

  list(): Promise<ListApiKeysResult> {
    return this.http.get<ListApiKeysResult>("/api/v1/api-keys");
  }

  revoke(keyId: string): Promise<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/v1/api-keys/${keyId}`);
  }
}
