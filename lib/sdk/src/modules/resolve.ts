import { HttpClient } from "../utils/http.js";
import type {
  ResolutionResult,
  DiscoverOptions,
  DiscoverResult,
  AgentIDCredential,
} from "../types.js";

const DEFAULT_BASE_URL = "https://getagent.id";

export class ResolveModule {
  static async resolve(
    handle: string,
    baseUrl = DEFAULT_BASE_URL,
  ): Promise<ResolutionResult> {
    const http = new HttpClient({ baseUrl });
    const cleanHandle = handle.replace(/\.(agentid|agent)$/i, "").toLowerCase();
    return http.get<ResolutionResult>(`/api/v1/resolve/${encodeURIComponent(cleanHandle)}`);
  }

  static async discover(
    options: DiscoverOptions = {},
    baseUrl = DEFAULT_BASE_URL,
  ): Promise<DiscoverResult> {
    const http = new HttpClient({ baseUrl });
    const params = new URLSearchParams();
    if (options.capability) params.set("capability", options.capability);
    if (options.minTrust !== undefined) params.set("minTrust", String(options.minTrust));
    if (options.protocol) params.set("protocol", options.protocol);
    if (options.verifiedOnly) params.set("verifiedOnly", "true");
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    const qs = params.toString();
    return http.get<DiscoverResult>(`/api/v1/resolve${qs ? `?${qs}` : ""}`);
  }

  static async verifyCredential(
    credential: AgentIDCredential,
    baseUrl = DEFAULT_BASE_URL,
  ): Promise<boolean> {
    if (!credential.proof || !credential.proof.signatureValue) {
      return false;
    }

    if (!credential.expirationDate) {
      return false;
    }

    const now = new Date();
    if (new Date(credential.expirationDate) < now) {
      return false;
    }

    const handle = credential.credentialSubject?.handle;
    if (!handle) {
      return false;
    }

    try {
      const http = new HttpClient({ baseUrl });

      const verifyResult = await http.post<{ valid: boolean; reason?: string }>(
        `/api/v1/p/${encodeURIComponent(handle)}/credential/verify`,
        credential,
      );

      return verifyResult.valid === true;
    } catch {
      return false;
    }
  }
}
