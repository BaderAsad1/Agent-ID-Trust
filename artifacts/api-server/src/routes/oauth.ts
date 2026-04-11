/**
 * OAuth 2.0 Authorization Server Routes
 *
 * GET  /oauth/authorize  — Initiate authorization code flow (with PKCE)
 * POST /oauth/token      — Exchange code for tokens; signed assertion grant; refresh token rotation
 * POST /oauth/revoke     — Revoke access or refresh token (RFC 7009)
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod/v4";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  oauthClientsTable,
  agentsTable,
} from "@workspace/db/schema";
import { isAgentOwner } from "../services/agents";
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  signedAssertionGrant,
  refreshAccessToken,
  revokeOAuthToken,
  introspectOAuthToken,
  verifyJwt,
} from "../services/oauth";
import { AppError } from "../middlewares/error-handler";
import { requireAuth } from "../middlewares/replit-auth";
import { registrationRateLimit } from "../middlewares/rate-limit";
import { env } from "../lib/env";

const router = Router();

const authorizeSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url().optional(),
  response_type: z.literal("code"),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  // H3: Only S256 is accepted — `plain` provides no security benefit and is disallowed per RFC 7636 §4.2.
  code_challenge_method: z.enum(["S256"]).optional(),
  agent_id: z.string().uuid().optional(),
});

const tokenCodeSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  redirect_uri: z.string().optional(),
  code_verifier: z.string().optional(),
});

const tokenAssertionSchema = z.object({
  grant_type: z.literal("urn:agentid:grant-type:signed-assertion"),
  client_id: z.string().min(1),
  agent_id: z.string().uuid(),
  scope: z.string().optional(),
  assertion: z.string().min(1),
});

const tokenRefreshSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
});

const revokeSchema = z.object({
  token: z.string().min(1),
  token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  client_id: z.string().min(1).optional(),
  client_secret: z.string().optional(),
});

// Hardcoded demo client — no DB row required. Works for /demo and localhost dev.
const DEMO_CLIENT = {
  id:               "00000000-0000-0000-0000-000000000001",
  clientId:         "agclient_demo",
  clientSecretHash: null,
  name:             "Agent ID Demo",
  description:      "Interactive live demo of Sign in with Agent ID",
  redirectUris:     [
    "https://getagent.id/demo/callback",
    "http://localhost:5173/demo/callback",
    "http://localhost:3000/demo/callback",
  ] as string[],
  allowedScopes:    ["read", "agents:read"] as string[],
  grantTypes:       ["authorization_code"] as string[],
  ownerUserId:      "00000000-0000-0000-0000-000000000001",
  lastUsedAt:       null,
  revokedAt:        null,
  createdAt:        new Date("2025-01-01"),
  updatedAt:        new Date("2025-01-01"),
};

async function lookupClient(clientId: string) {
  if (clientId === DEMO_CLIENT.clientId) return DEMO_CLIENT;

  const client = await db.query.oauthClientsTable.findFirst({
    where: and(
      eq(oauthClientsTable.clientId, clientId),
      isNull(oauthClientsTable.revokedAt),
    ),
  });

  if (!client) throw new AppError(400, "invalid_client", "Unknown client_id");
  return client;
}

async function validateClientSecret(clientId: string, clientSecretHash?: string) {
  const client = await lookupClient(clientId);

  if (client.clientSecretHash) {
    if (!clientSecretHash) {
      throw new AppError(401, "invalid_client", "client_secret is required for confidential clients");
    }
    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(clientSecretHash).digest("hex");
    if (hash !== client.clientSecretHash) {
      throw new AppError(401, "invalid_client", "Invalid client credentials");
    }
  }

  return client;
}

router.get("/authorize", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = authorizeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "invalid_request", "Invalid authorization request parameters");
    }

    const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method, agent_id } = parsed.data;

    const client = await lookupClient(client_id);

    const clientGrantTypes = (client.grantTypes as string[]) || [];
    if (!clientGrantTypes.includes("authorization_code")) {
      throw new AppError(400, "unauthorized_client", "Client is not authorized for authorization_code grant type");
    }

    if (redirect_uri && client.redirectUris && !client.redirectUris.includes(redirect_uri)) {
      throw new AppError(400, "invalid_request", "redirect_uri not registered for this client");
    }

    const isPublicClient = !client.clientSecretHash;
    if (isPublicClient && !code_challenge) {
      throw new AppError(400, "invalid_request", "PKCE code_challenge is required for public clients");
    }

    const scopes = (scope || "").split(" ").filter(Boolean);
    const allowedScopes = (client.allowedScopes as string[]) || [];
    // C2: Deny-by-default — empty allowedScopes means no scopes are permitted.
    const grantedScopes = scopes.filter(s => allowedScopes.includes(s));

    const APP_URL = env().APP_URL || "https://getagent.id";

    const params = new URLSearchParams({
      client_id,
      client_name: client.name,
      scopes: grantedScopes.join(" "),
      state: state || "",
      redirect_uri: redirect_uri || (client.redirectUris?.[0] || ""),
      ...(code_challenge ? { code_challenge, code_challenge_method: code_challenge_method || "S256" } : {}),
      ...(agent_id ? { agent_id } : {}),
    });

    res.redirect(`${APP_URL}/authorize?${params.toString()}`);
  } catch (err) {
    next(err);
  }
});

router.post("/authorize/approve", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { client_id, agent_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = req.body;

    if (!client_id || !agent_id) {
      throw new AppError(400, "invalid_request", "client_id and agent_id are required");
    }

    const client = await lookupClient(client_id);

    const clientGrantTypes = (client.grantTypes as string[]) || [];
    if (!clientGrantTypes.includes("authorization_code")) {
      throw new AppError(400, "unauthorized_client", "Client is not authorized for authorization_code grant type");
    }

    const isPublicClient = !client.clientSecretHash;
    if (isPublicClient && !code_challenge) {
      throw new AppError(400, "invalid_request", "PKCE code_challenge is required for public clients");
    }

    const registeredUris = (client.redirectUris as string[] | null | undefined) || [];
    const effectiveRedirectUri = redirect_uri || registeredUris[0] || "";

    if (effectiveRedirectUri) {
      // Demo client: allow any redirect that ends with /demo/callback (cross-origin dev friendly)
      const isDemoClient = client_id === "agclient_demo";
      const uriAllowed = registeredUris.includes(effectiveRedirectUri) ||
        (isDemoClient && effectiveRedirectUri.endsWith("/demo/callback"));
      if (!uriAllowed) {
        throw new AppError(400, "invalid_request", "redirect_uri does not match any registered URI for this client");
      }
    } else {
      throw new AppError(400, "invalid_request", "redirect_uri is required and no registered URIs are configured for this client");
    }

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent_id),
    });

    if (!agent) throw new AppError(400, "invalid_request", "Agent not found");

    const user = req.user!;
    if (!isAgentOwner(agent, user.id)) {
      throw new AppError(403, "access_denied", "You do not own this agent");
    }

    if (["revoked", "draft", "inactive", "suspended"].includes(agent.status)) {
      throw new AppError(400, "access_denied", `Agent status '${agent.status}' is not eligible for authorization`);
    }

    const requestedScopes = (scope || "").split(" ").filter(Boolean);
    const allowedScopes = (client.allowedScopes as string[]) || [];
    // C2: Deny-by-default — only grant scopes explicitly listed on the client.
    const scopes = requestedScopes.filter((s: string) => allowedScopes.includes(s));

    const code = await createAuthorizationCode(
      client_id,
      agent_id,
      effectiveRedirectUri,
      scopes,
      code_challenge,
      code_challenge_method,
    );

    const params = new URLSearchParams({ code, ...(state ? { state } : {}) });

    res.json({ redirect_url: `${effectiveRedirectUri}?${params.toString()}`, code, state });
  } catch (err) {
    next(err);
  }
});

router.post("/token", registrationRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const grantType = req.body?.grant_type;

    if (grantType === "authorization_code") {
      const parsed = tokenCodeSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "invalid_request", "Invalid token request");

      const { code, client_id, client_secret, redirect_uri, code_verifier } = parsed.data;
      const client = client_id === DEMO_CLIENT.clientId ? DEMO_CLIENT : await db.query.oauthClientsTable.findFirst({
        where: and(eq(oauthClientsTable.clientId, client_id), isNull(oauthClientsTable.revokedAt)),
      });
      if (!client) throw new AppError(400, "invalid_client", "Unknown client_id");

      const clientGrantTypes = (client.grantTypes as string[]) || [];
      if (!clientGrantTypes.includes("authorization_code")) {
        throw new AppError(400, "unauthorized_client", "Client is not authorized for authorization_code grant type");
      }

      const isPublicClient = !client.clientSecretHash;
      if (isPublicClient && !code_verifier) {
        throw new AppError(400, "invalid_request", "code_verifier is required for public clients (PKCE mandatory)");
      }

      if (client.clientSecretHash) {
        if (!client_secret) {
          throw new AppError(401, "invalid_client", "client_secret required for confidential client");
        }
        const { createHash } = await import("crypto");
        const hash = createHash("sha256").update(client_secret).digest("hex");
        if (hash !== client.clientSecretHash) {
          throw new AppError(401, "invalid_client", "Invalid client credentials");
        }
      }

      const result = await exchangeAuthorizationCode(code, client_id, redirect_uri, code_verifier);
      res.json(result);
    } else if (grantType === "refresh_token") {
      const parsed = tokenRefreshSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "invalid_request", "Invalid refresh token request");

      const { refresh_token, client_id, client_secret } = parsed.data;
      const client = client_id === DEMO_CLIENT.clientId ? DEMO_CLIENT : await db.query.oauthClientsTable.findFirst({
        where: and(eq(oauthClientsTable.clientId, client_id), isNull(oauthClientsTable.revokedAt)),
      });
      if (!client) throw new AppError(400, "invalid_client", "Unknown client_id");

      if (client.clientSecretHash) {
        if (!client_secret) throw new AppError(401, "invalid_client", "client_secret required for confidential client");
        const { createHash } = await import("crypto");
        const hash = createHash("sha256").update(client_secret).digest("hex");
        if (hash !== client.clientSecretHash) throw new AppError(401, "invalid_client", "Invalid client credentials");
      }

      const result = await refreshAccessToken(refresh_token, client_id);
      res.json(result);
    } else if (grantType === "urn:agentid:grant-type:signed-assertion") {
      const parsed = tokenAssertionSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, "invalid_request", "Invalid assertion token request");

      const { client_id, agent_id, scope, assertion } = parsed.data;
      const client = await db.query.oauthClientsTable.findFirst({
        where: and(eq(oauthClientsTable.clientId, client_id), isNull(oauthClientsTable.revokedAt)),
      });
      if (!client) throw new AppError(400, "invalid_client", "Unknown client_id");

      if (client.clientSecretHash) {
        throw new AppError(401, "invalid_client", "Signed-assertion grant is not permitted for confidential clients. Use PKCE authorization_code flow instead.");
      }

      const clientGrantTypes = (client.grantTypes as string[]) || [];
      if (!clientGrantTypes.includes("urn:agentid:grant-type:signed-assertion")) {
        throw new AppError(400, "unauthorized_client", "Client is not authorized for signed-assertion grant type");
      }

      const requestedScopes = (scope || "").split(" ").filter(Boolean);
      const clientAllowedScopes = (client.allowedScopes as string[]) || [];
      // C2: Deny-by-default — only grant scopes explicitly listed on the client.
      const scopes = requestedScopes.filter((s: string) => clientAllowedScopes.includes(s));

      if (requestedScopes.length > 0 && scopes.length === 0) {
        throw new AppError(400, "invalid_scope", "None of the requested scopes are permitted for this client");
      }

      const result = await signedAssertionGrant(agent_id, client_id, scopes, assertion);
      res.json(result);
    } else {
      throw new AppError(400, "unsupported_grant_type", `Grant type '${grantType}' is not supported. Supported: authorization_code, refresh_token, urn:agentid:grant-type:signed-assertion`);
    }
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    // Convert service-level OAuth errors (e.g. "invalid_grant: PKCE verification failed")
    // to proper 400 responses instead of falling through to the 500 handler.
    const msg = (err as Error).message || "";
    const colonIdx = msg.indexOf(":");
    if (colonIdx > 0) {
      const code = msg.slice(0, colonIdx).trim();
      const description = msg.slice(colonIdx + 1).trim();
      const oauthErrorCodes = [
        "invalid_grant", "invalid_client", "invalid_request",
        "invalid_scope", "unauthorized_client", "access_denied",
        "policy_violation",
      ];
      if (oauthErrorCodes.includes(code)) {
        next(new AppError(400, code, description));
        return;
      }
    }
    next(err);
  }
});

/**
 * GET/POST /oauth/userinfo  (OIDC Core §5.3)
 * Returns agent identity claims for a valid access token.
 * Accepts Bearer token in Authorization header.
 */
router.get("/userinfo", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).set("WWW-Authenticate", 'Bearer realm="agentid"').json({ error: "invalid_token", error_description: "Bearer token required" });
      return;
    }
    const token = authHeader.slice(7);

    // Try JWT verification first for fast path
    let sub: string | undefined;
    let jwtClaims: Record<string, unknown> | null = null;
    try {
      jwtClaims = await verifyJwt(token);
      sub = jwtClaims?.sub as string | undefined;
    } catch {
      // fall through to introspection
    }

    // Validate token is active in DB
    const info = await introspectOAuthToken(token);
    if (!info.active) {
      res.status(401).set("WWW-Authenticate", 'Bearer realm="agentid", error="invalid_token"').json({ error: "invalid_token", error_description: "Token is expired, revoked, or invalid" });
      return;
    }

    const issuer = env().APP_URL || "https://getagent.id";

    res.set("Cache-Control", "no-store").json({
      sub: info.sub,
      iss: issuer,
      // Agent identity
      agent_id: jwtClaims?.agent_id ?? info.sub,
      handle: jwtClaims?.handle ?? null,
      // Trust & verification
      trust_tier: info.trust_tier,
      verification_status: info.verification_status,
      agent_state: jwtClaims?.agent_state ?? null,
      claim_state: jwtClaims?.claim_state ?? null,
      owner_type: info.owner_type,
      owner_backed: jwtClaims?.owner_backed ?? null,
      // Session
      session_type: jwtClaims?.session_type ?? "delegated",
      scope: info.scope,
      client_id: info.client_id,
      // Token metadata
      iat: info.iat,
      exp: info.exp,
      // Full trust context for richer queries
      trust_context: info.trust_context,
    });
  } catch (err) {
    next(err);
  }
});

// Also accept POST for clients that send the token in the request body (§5.3.1)
router.post("/userinfo", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const bodyToken = req.body?.access_token as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : bodyToken;

    if (!token) {
      res.status(401).set("WWW-Authenticate", 'Bearer realm="agentid"').json({ error: "invalid_token", error_description: "Bearer token required" });
      return;
    }

    let jwtClaims: Record<string, unknown> | null = null;
    try { jwtClaims = await verifyJwt(token); } catch { /* ignore */ }

    const info = await introspectOAuthToken(token);
    if (!info.active) {
      res.status(401).set("WWW-Authenticate", 'Bearer realm="agentid", error="invalid_token"').json({ error: "invalid_token", error_description: "Token is expired, revoked, or invalid" });
      return;
    }

    const issuer = env().APP_URL || "https://getagent.id";
    res.set("Cache-Control", "no-store").json({
      sub: info.sub, iss: issuer,
      agent_id: jwtClaims?.agent_id ?? info.sub, handle: jwtClaims?.handle ?? null,
      trust_tier: info.trust_tier, verification_status: info.verification_status,
      agent_state: jwtClaims?.agent_state ?? null, claim_state: jwtClaims?.claim_state ?? null,
      owner_type: info.owner_type, owner_backed: jwtClaims?.owner_backed ?? null,
      session_type: jwtClaims?.session_type ?? "delegated",
      scope: info.scope, client_id: info.client_id,
      iat: info.iat, exp: info.exp, trust_context: info.trust_context,
    });
  } catch (err) { next(err); }
});

router.post("/revoke", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = revokeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "invalid_request", "Invalid revoke request");

    const { token, token_type_hint, client_id, client_secret } = parsed.data;

    if (client_id) {
      await validateClientSecret(client_id, client_secret);
    } else {
      res.status(401).json({
        error: "invalid_client",
        message: "client_id is required for token revocation",
      });
      return;
    }

    await revokeOAuthToken(token, token_type_hint, client_id);

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
