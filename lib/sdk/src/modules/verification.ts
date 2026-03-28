import type { HttpClient } from "../utils/http.js";

export interface VerificationChallenge {
  agentId: string;
  challenge: string;
  method: string;
  expiresAt: string;
}

export interface VerificationResult {
  verified: boolean;
  agentId: string;
  handle: string | null;
  trustScore: number;
  trustTier: string;
  bootstrapIssuedAt: string;
}

export class VerificationModule {
  constructor(private http: HttpClient) {}

  initiate(agentId: string, method: "key_challenge" = "key_challenge"): Promise<VerificationChallenge> {
    return this.http.post<VerificationChallenge>(
      `/api/v1/agents/${agentId}/verify/initiate`,
      { method },
    );
  }

  complete(
    agentId: string,
    options: { challenge: string; signature: string; kid: string },
  ): Promise<VerificationResult> {
    return this.http.post<VerificationResult>(
      `/api/v1/agents/${agentId}/verify/complete`,
      options,
    );
  }
}
