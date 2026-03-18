/**
 * OAuth 2.0 Authorization Server Routes — Phase 2
 *
 * GET  /oauth/authorize  — Initiate authorization code flow (with PKCE)
 * POST /oauth/token      — Exchange code for tokens; signed assertion grant
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
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  signedAssertionGrant,
  revokeOAuthToken,
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
  code_challenge_method: z.enum(["S256", "plain"]).optional(),
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

const revokeSchema = z.object({
  token: z.string().min(1),
  token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  client_id: z.string().min(1).optional(),
  client_secret: z.string().optional(),
});

async function lookupClient(clientId: string) {
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

const validateClient = validateClientSecret;

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
    const allowedScopes = client.allowedScopes || [];
    const grantedScopes = scopes.filter(s => allowedScopes.includes(s) || allowedScopes.length === 0);

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
      if (!registeredUris.includes(effectiveRedirectUri)) {
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
    if (agent.userId !== user.id) {
      throw new AppError(403, "access_denied", "You do not own this agent");
    }

    if (["revoked", "draft", "inactive", "suspended"].includes(agent.status)) {
      throw new AppError(400, "access_denied", `Agent status '${agent.status}' is not eligible for authorization`);
    }

    const requestedScopes = (scope || "").split(" ").filter(Boolean);
    const allowedScopes = (client.allowedScopes as string[]) || [];
    const scopes = allowedScopes.length > 0
      ? requestedScopes.filter((s: string) => allowedScopes.includes(s))
      : requestedScopes;

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
      const client = await db.query.oauthClientsTable.findFirst({
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
      const scopes = clientAllowedScopes.length > 0
        ? requestedScopes.filter((s: string) => clientAllowedScopes.includes(s))
        : requestedScopes;

      if (requestedScopes.length > 0 && scopes.length === 0) {
        throw new AppError(400, "invalid_scope", "None of the requested scopes are permitted for this client");
      }

      const result = await signedAssertionGrant(agent_id, client_id, scopes, assertion);
      res.json(result);
    } else {
      throw new AppError(400, "unsupported_grant_type", `Grant type '${grantType}' is not supported. Supported: authorization_code, urn:agentid:grant-type:signed-assertion`);
    }
  } catch (err) {
    next(err);
  }
});

router.post("/revoke", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = revokeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "invalid_request", "Invalid revoke request");

    const { token, token_type_hint, client_id, client_secret } = parsed.data;

    if (client_id) {
      await validateClient(client_id, client_secret);
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
