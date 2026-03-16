import type { HttpClient } from "../utils/http.js";
import type { TrustData } from "../types.js";

export class TrustModule {
  private http: HttpClient;
  private agentId: string;

  constructor(http: HttpClient, agentId: string) {
    this.http = http;
    this.agentId = agentId;
  }

  async get(): Promise<TrustData> {
    const result = await this.http.get<{
      agent_id: string;
      trust: TrustData;
    }>(`/api/v1/agents/${this.agentId}/runtime`);
    return result.trust;
  }
}
