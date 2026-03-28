import type { HttpClient } from "../utils/http.js";

export interface SubHandleAgent {
  id: string;
  handle: string | null;
  displayName: string | null;
  status: string;
  trustScore: number | null;
  capabilities: string[];
  createdAt: string;
}

export interface FleetEntry {
  rootHandle: string;
  rootAgent: Record<string, unknown>;
  subHandles: SubHandleAgent[];
}

export interface ListFleetsResult {
  fleets: FleetEntry[];
}

export interface CreateSubHandleOptions {
  rootHandle: string;
  subName: string;
  displayName: string;
  description?: string;
  capabilities?: string[];
  endpointUrl?: string;
}

export class FleetModule {
  constructor(private http: HttpClient) {}

  list(): Promise<ListFleetsResult> {
    return this.http.get<ListFleetsResult>("/api/v1/fleet");
  }

  createSubHandle(options: CreateSubHandleOptions): Promise<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>("/api/v1/fleet/sub-handles", options);
  }

  deleteSubHandle(agentId: string): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/v1/fleet/sub-handles/${agentId}`);
  }
}
