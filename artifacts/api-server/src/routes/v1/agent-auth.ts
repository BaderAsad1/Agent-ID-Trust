/**
 * Agent Auth Routes — Phase 1
 *
 * POST /v1/auth/challenge  — Request a nonce for auth-time challenge/response
 * POST /v1/auth/session    — Submit signed challenge, receive session JWT
 * POST /v1/auth/introspect — Inspect a session or OAuth token (RFC 7662)
 * POST /v1/auth/revoke     — Revoke a session token (requires agent auth)
 */
import { Router } from "express";
import { z } from "zod/v4";
import { createAuthChallenge, verifyAndIssueSession, introspectToken, revokeSession } from "../../services/auth-session";
import { introspectOAuthToken } from "../../services/oauth";
import { AppError } from "../../middlewares/error-handler";
import { registrationRateLimit, authChallengeRateLimit } from "../../middlewares/rate-limit";
import { requireAgentAuth } from "../../middlewares/agent-auth";

const router = Router();

const challengeSchema = z.object({
  agentId: z.string().uuid(),
  audience: z.string().max(500).optional(),
});

const sessionSchema = z.object({
  agentId: z.string().uuid(),
  nonce: z.string().min(1),
  signature: z.string().min(1),
  kid: z.string().min(1),
  scope: z.string().optional(),
});

const introspectSchema = z.object({
  token: z.string().min(1),
});

const revokeSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().max(255).optional(),
});

router.post("/challenge", authChallengeRateLimit, registrationRateLimit, async (req, res, next) => {
  try {
    const parsed = challengeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { agentId, audience } = parsed.data;
    const result = await createAuthChallenge(agentId, audience);

    const challengeMessage = result.audience
      ? `${result.nonce}:${result.agentId}:${result.audience}`
      : `${result.nonce}:${result.agentId}`;

    res.json({
      nonce: result.nonce,
      agentId: result.agentId,
      audience: result.audience,
      expiresAt: result.expiresAt.toISOString(),
      expiresInSeconds: 300,
      challenge_message: challengeMessage,
      instructions: "Sign the challenge_message string using your agent's Ed25519 private key (base64 SPKI format) and submit the signature to POST /v1/auth/session",
    });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    const message = (err as Error).message;
    if (message.includes("not found") || message.includes("eligible")) {
      return next(new AppError(400, "INVALID_REQUEST", message));
    }
    next(err);
  }
});

router.post("/session", authChallengeRateLimit, registrationRateLimit, async (req, res, next) => {
  try {
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { agentId, nonce, signature, kid, scope } = parsed.data;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
    const ua = req.headers["user-agent"];
    const requestedScopes = scope ? scope.split(" ").filter(Boolean) : undefined;

    const result = await verifyAndIssueSession(agentId, nonce, signature, kid, ip, ua, requestedScopes);

    res.json({
      token: result.sessionToken,
      tokenType: "Bearer",
      sessionId: result.sessionId,
      expiresAt: result.expiresAt.toISOString(),
      expiresInSeconds: 900,
      scope: result.scopes.join(" "),
    });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    const message = (err as Error).message;
    if (message.includes("nonce") || message.includes("expired") || message.includes("Signature") || message.includes("key") || message.includes("status")) {
      return next(new AppError(401, "AUTH_FAILED", message));
    }
    next(err);
  }
});

function checkIntrospectionAuth(req: import("express").Request, res: import("express").Response): boolean {
  const providedSecret = req.headers["x-introspection-secret"] as string | undefined;
  const introspectionSecret = process.env.OAUTH_INTROSPECTION_SECRET;

  if (introspectionSecret && providedSecret === introspectionSecret) return true;

  res.status(401).json({
    error: "INTROSPECT_UNAUTHORIZED",
    message: "Introspection requires a valid X-Introspection-Secret header (resource-server only endpoint).",
  });
  return false;
}

router.post("/introspect", async (req, res, next) => {
  try {
    if (!checkIntrospectionAuth(req, res)) return;

    const parsed = introspectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { token } = parsed.data;

    let result: Record<string, unknown> = await introspectToken(token);
    if (!result.active) {
      result = await introspectOAuthToken(token);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/revoke", requireAgentAuth, async (req, res, next) => {
  try {
    const parsed = revokeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { sessionId, reason } = parsed.data;
    const authenticatedAgentId = req.authenticatedAgent!.id;

    const success = await revokeSession(sessionId, reason, authenticatedAgentId);
    if (!success) {
      throw new AppError(403, "REVOKE_DENIED", "Session not found or you do not own this session");
    }

    res.json({ success: true, sessionId });
  } catch (err) {
    next(err);
  }
});

export default router;
