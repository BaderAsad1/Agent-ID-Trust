/**
 * Auth module — Relying Party helpers for verifying Agent ID tokens.
 *
 * IMPORTANT: Agent tokens and user (human) tokens are cryptographically distinct.
 * Always use the correct verify function for the expected principal type:
 *
 *   - verifyAgentToken()  — verifies machine/agent identity tokens (sub = agentId, tokenType = "agent")
 *   - verifyUserToken()   — verifies human user session tokens    (sub = userId,  tokenType = "user")
 *   - parseAgentClaims()  — low-level, parses without verification (use only for debugging)
 *   - createRelayingPartyClient() — full OAuth client for RP servers
 *
 * Mixing token types silently fails dangerous scenarios (e.g. an agent token
 * being accepted where a human token is required). Both helpers enforce the
 * `tokenType` claim so type confusion is caught at verify-time.
 */
import { HttpClient } from "../utils/http.js";

/** Discriminant for token type. */
export type AgentIDTokenType = "agent" | "user";

export interface AgentTokenClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  jti: string;
  /** Always "agent" for machine identity tokens. */
  tokenType: "agent";
  agentId: string;
  trustTier: string;
  verificationStatus: string;
  ownerType: string;
  scope: string;
  scopes: string[];
  trustContext: {
    trustTier: string;
    verificationStatus: string;
    ownerType: string;
    unclaimed: boolean;
    orgId?: string;
    orgName?: string;
    capabilities?: string[];
  };
}

export interface UserTokenClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  jti: string;
  /** Always "user" for human identity tokens. */
  tokenType: "user";
  userId: string;
  email?: string;
  scope: string;
  scopes: string[];
}

export interface TokenIntrospectionResult {
  active: boolean;
  sub?: string;
  trustTier?: string;
  verificationStatus?: string;
  ownerType?: string;
  scopes?: string[];
  exp?: number;
  iat?: number;
  sessionId?: string;
  trustContext?: Record<string, unknown>;
}

export interface RelayingPartyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl?: string;
  scopes?: string[];
  /** Optional: server-to-server introspection secret for token verification fallback. */
  introspectionSecret?: string;
}

/**
 * Parse claims from an Agent ID JWT without verification.
 * Use verifyAgentToken() for security-sensitive use cases.
 *
 * @internal Low-level helper. Does NOT enforce tokenType — use verifyAgentToken() instead.
 */
export function parseAgentClaims(token: string): AgentTokenClaims {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid token format");

  const claimsRaw = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
  const claims = JSON.parse(claimsRaw);

  return {
    sub: claims.sub,
    iss: claims.iss,
    aud: claims.aud,
    iat: claims.iat,
    exp: claims.exp,
    jti: claims.jti,
    tokenType: "agent",
    agentId: claims.agent_id,
    trustTier: claims.trust_tier,
    verificationStatus: claims.verification_status,
    ownerType: claims.owner_type,
    scope: claims.scope || "",
    scopes: (claims.scope || "").split(" ").filter(Boolean),
    trustContext: claims.trust_context || {
      trustTier: claims.trust_tier,
      verificationStatus: claims.verification_status,
      ownerType: claims.owner_type,
      unclaimed: claims.owner_type === "none",
    },
  };
}

/**
 * Parse claims from a user (human) JWT without verification.
 * Use verifyUserToken() for security-sensitive use cases.
 *
 * @internal Low-level helper.
 */
export function parseUserClaims(token: string): UserTokenClaims {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid token format");

  const claimsRaw = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
  const claims = JSON.parse(claimsRaw);

  return {
    sub: claims.sub,
    iss: claims.iss,
    aud: claims.aud,
    iat: claims.iat,
    exp: claims.exp,
    jti: claims.jti,
    tokenType: "user",
    userId: claims.sub,
    email: claims.email,
    scope: claims.scope || "",
    scopes: (claims.scope || "").split(" ").filter(Boolean),
  };
}

type JwkWithKid = JsonWebKey & { kid?: string };

/**
 * Cached JWKS keys for offline verification (keyed by kid).
 * Keys are fetched at first call and cached for 5 minutes.
 */
let jwksCache: { keys: Record<string, JwkWithKid>; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchJwks(baseUrl: string): Promise<Record<string, JwkWithKid>> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }

  const http = new HttpClient({ baseUrl });
  const result = await http.get<{ keys: JwkWithKid[] }>("/.well-known/jwks.json");

  const keyMap: Record<string, JwkWithKid> = {};
  for (const key of result.keys || []) {
    if (key.kid && typeof key.kid === "string") {
      keyMap[key.kid] = key;
    }
  }

  jwksCache = { keys: keyMap, fetchedAt: now };
  return keyMap;
}

/**
 * Verify an Agent ID token using the JWKS endpoint for signature verification.
 * Falls back to introspection if crypto verification is not available in the runtime.
 * Returns the token claims if valid, throws if invalid.
 *
 * For server-side usage, provide `introspectionSecret` to authenticate the fallback
 * introspection request. Without it, fallback introspection will fail in production.
 */
export async function verifyAgentToken(
  token: string,
  options?: {
    baseUrl?: string;
    audience?: string;
    skipSignatureVerification?: boolean;
    introspectionSecret?: string;
  },
): Promise<AgentTokenClaims> {
  const baseUrl = options?.baseUrl || "https://getagent.id";

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const headerRaw = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
  const header = JSON.parse(headerRaw) as { alg?: string; kid?: string };
  const claimsRaw = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
  const claims = JSON.parse(claimsRaw);

  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now) throw new Error("Token has expired");
  if (!claims.iat || claims.iat > now + 60) throw new Error("Token issued in the future");

  const expectedIssuer = baseUrl.replace(/\/$/, "");
  if (!claims.iss) throw new Error("Token missing issuer (iss)");
  const normalizedIss = String(claims.iss).replace(/\/$/, "");
  if (normalizedIss !== expectedIssuer && normalizedIss !== "agentid") {
    throw new Error(`Token issuer mismatch: expected '${expectedIssuer}', got '${normalizedIss}'`);
  }

  if (options?.audience) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(options.audience)) throw new Error("Token audience mismatch");
  }

  if (!options?.skipSignatureVerification) {
    const introspectionSecret = options?.introspectionSecret;

    const performIntrospection = async (): Promise<void> => {
      const url = `${baseUrl}/api/v1/auth/introspect`;
      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      if (introspectionSecret) {
        reqHeaders["X-Introspection-Secret"] = introspectionSecret;
      }
      const resp = await fetch(url, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({ token }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Introspection request failed (${resp.status}): ${text}`);
      }
      const result = (await resp.json()) as TokenIntrospectionResult;
      if (!result.active) throw new Error("Token is not active");
    };

    try {
      const keyMap = await fetchJwks(baseUrl);
      const kid = header.kid;

      if (kid && keyMap[kid]) {
        const jwk = keyMap[kid];
        const hasCryptoSubtle = typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle !== "undefined";

        if (hasCryptoSubtle) {
          try {
            const cryptoKey = await globalThis.crypto.subtle.importKey(
              "jwk",
              jwk,
              { name: "Ed25519", namedCurve: "Ed25519" },
              false,
              ["verify"],
            );

            const encoder = new TextEncoder();
            const data = encoder.encode(`${parts[0]}.${parts[1]}`);
            const sigBytes = Uint8Array.from(
              atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")),
              c => c.charCodeAt(0),
            );

            const valid = await globalThis.crypto.subtle.verify("Ed25519", cryptoKey, sigBytes, data);
            if (!valid) throw new Error("Token signature verification failed");
          } catch (cryptoErr) {
            if ((cryptoErr as Error).message.includes("signature")) throw cryptoErr;
            await performIntrospection();
          }
        } else {
          await performIntrospection();
        }
      } else {
        await performIntrospection();
      }
    } catch (err) {
      if ((err as Error).message.includes("not active") || (err as Error).message.includes("signature")) {
        throw err;
      }
      await performIntrospection();
    }
  }

  const parsed = parseAgentClaims(token);

  if (claims.token_type && claims.token_type !== "agent") {
    throw new Error(
      `Token type mismatch: expected 'agent', got '${claims.token_type}'. ` +
      `Use verifyUserToken() for human session tokens.`,
    );
  }

  if (!claims.agent_id) {
    throw new Error(
      "Token is missing agent_id claim. This does not appear to be an agent token. " +
      "Use verifyUserToken() for human session tokens.",
    );
  }

  return parsed;
}

/**
 * Verify a human user session token using the JWKS endpoint.
 * Falls back to introspection if crypto verification is not available.
 *
 * Use this only when the expected principal is a human user — NOT an agent.
 * For agent tokens, use verifyAgentToken() instead.
 */
export async function verifyUserToken(
  token: string,
  options?: {
    baseUrl?: string;
    audience?: string;
    skipSignatureVerification?: boolean;
    introspectionSecret?: string;
  },
): Promise<UserTokenClaims> {
  const baseUrl = options?.baseUrl || "https://getagent.id";

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const headerRaw = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
  const header = JSON.parse(headerRaw) as { alg?: string; kid?: string };
  const claimsRaw = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
  const claims = JSON.parse(claimsRaw);

  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now) throw new Error("Token has expired");
  if (!claims.iat || claims.iat > now + 60) throw new Error("Token issued in the future");

  const expectedIssuer = baseUrl.replace(/\/$/, "");
  if (!claims.iss) throw new Error("Token missing issuer (iss)");
  const normalizedIss = String(claims.iss).replace(/\/$/, "");
  if (normalizedIss !== expectedIssuer && normalizedIss !== "agentid") {
    throw new Error(`Token issuer mismatch: expected '${expectedIssuer}', got '${normalizedIss}'`);
  }

  if (claims.token_type && claims.token_type !== "user") {
    throw new Error(
      `Token type mismatch: expected 'user', got '${claims.token_type}'. ` +
      `Use verifyAgentToken() for machine identity tokens.`,
    );
  }

  if (claims.agent_id) {
    throw new Error(
      "Token contains agent_id claim — this appears to be an agent token, not a user token. " +
      "Use verifyAgentToken() for machine identity tokens.",
    );
  }

  if (options?.audience) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(options.audience)) throw new Error("Token audience mismatch");
  }

  if (!options?.skipSignatureVerification) {
    const introspectionSecret = options?.introspectionSecret;

    const performIntrospection = async (): Promise<void> => {
      const url = `${baseUrl}/api/v1/auth/introspect`;
      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      if (introspectionSecret) {
        reqHeaders["X-Introspection-Secret"] = introspectionSecret;
      }
      const resp = await fetch(url, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({ token }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Introspection request failed (${resp.status}): ${text}`);
      }
      const result = (await resp.json()) as TokenIntrospectionResult;
      if (!result.active) throw new Error("Token is not active");
    };

    try {
      const keyMap = await fetchJwks(baseUrl);
      const kid = header.kid;

      if (kid && keyMap[kid]) {
        const jwk = keyMap[kid];
        const hasCryptoSubtle = typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle !== "undefined";

        if (hasCryptoSubtle) {
          try {
            const cryptoKey = await globalThis.crypto.subtle.importKey(
              "jwk",
              jwk,
              { name: "Ed25519", namedCurve: "Ed25519" },
              false,
              ["verify"],
            );

            const encoder = new TextEncoder();
            const data = encoder.encode(`${parts[0]}.${parts[1]}`);
            const sigBytes = Uint8Array.from(
              atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")),
              c => c.charCodeAt(0),
            );

            const valid = await globalThis.crypto.subtle.verify("Ed25519", cryptoKey, sigBytes, data);
            if (!valid) throw new Error("Token signature verification failed");
          } catch (cryptoErr) {
            if ((cryptoErr as Error).message.includes("signature")) throw cryptoErr;
            await performIntrospection();
          }
        } else {
          await performIntrospection();
        }
      } else {
        await performIntrospection();
      }
    } catch (err) {
      if ((err as Error).message.includes("not active") || (err as Error).message.includes("signature")) {
        throw err;
      }
      await performIntrospection();
    }
  }

  return parseUserClaims(token);
}

/**
 * Create a Relying Party client that wraps the OAuth client flow.
 */
export function createRelayingPartyClient(config: RelayingPartyConfig) {
  const baseUrl = config.baseUrl || "https://getagent.id";
  const http = new HttpClient({ baseUrl });

  return {
    /**
     * Get the authorization URL to redirect the user/agent to.
     */
    getAuthorizationUrl(options?: {
      state?: string;
      agentId?: string;
      codeChallenge?: string;
      codeChallengeMethod?: string;
    }): string {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: (config.scopes || ["read"]).join(" "),
        ...(options?.state ? { state: options.state } : {}),
        ...(options?.agentId ? { agent_id: options.agentId } : {}),
        ...(options?.codeChallenge ? {
          code_challenge: options.codeChallenge,
          code_challenge_method: options.codeChallengeMethod || "S256",
        } : {}),
      });
      return `${baseUrl}/oauth/authorize?${params.toString()}`;
    },

    /**
     * Exchange an authorization code for access and refresh tokens.
     */
    async exchangeCode(
      code: string,
      codeVerifier?: string,
    ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; tokenType: string }> {
      const body: Record<string, string> = {
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
      };
      if (codeVerifier) body.code_verifier = codeVerifier;

      const result = await http.post<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        tokenType: string;
      }>("/oauth/token", body);

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        tokenType: result.tokenType,
      };
    },

    /**
     * Exchange a signed assertion JWT for access and refresh tokens.
     * This is the server-to-server flow — no redirect required.
     */
    async exchangeAssertion(
      agentId: string,
      assertionJwt: string,
      scopes?: string[],
    ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; tokenType: string }> {
      const result = await http.post<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        tokenType: string;
      }>("/oauth/token", {
        grant_type: "urn:agentid:grant-type:signed-assertion",
        client_id: config.clientId,
        agent_id: agentId,
        assertion: assertionJwt,
        scope: (scopes || config.scopes || ["read"]).join(" "),
      });

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        tokenType: result.tokenType,
      };
    },

    /**
     * Revoke a token per RFC 7009. Requires client_secret.
     */
    async revokeToken(token: string, tokenTypeHint?: "access_token" | "refresh_token"): Promise<void> {
      await http.post("/oauth/revoke", {
        token,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...(tokenTypeHint ? { token_type_hint: tokenTypeHint } : {}),
      });
    },

    /**
     * Verify and parse an Agent ID token using JWKS.
     * Uses the configured introspection secret for server-side fallback.
     */
    async verifyToken(token: string, audience?: string): Promise<AgentTokenClaims> {
      return verifyAgentToken(token, {
        baseUrl,
        audience,
        introspectionSecret: config.introspectionSecret,
      });
    },
  };
}
