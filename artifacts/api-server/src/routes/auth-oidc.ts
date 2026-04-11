import { Router, type Request, type Response } from "express";
import { GitHub, Google, generateState, generateCodeVerifier } from "arctic";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, magicLinkTokensTable, agentsTable } from "@workspace/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  clearSession,
  getSessionId,
  getSession,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
  type AuthSessionUser,
} from "../lib/auth";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";
import { sendMagicLinkEmail } from "../services/email";
import { magicLinkSendRateLimit } from "../middlewares/rate-limit";
import { exchangeAuthorizationCode } from "../services/oauth";

const router = Router();

function getAppUrl(req: Request): string {
  const cfg = env();
  if (cfg.AUTH_BASE_URL && cfg.NODE_ENV === "production") {
    return cfg.AUTH_BASE_URL;
  }
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  const cookieOpts: import("express").CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
    // L2: Explicit domain allows the session cookie to be shared across subdomains
    // (e.g., api.getagent.id and getagent.id). Omit if COOKIE_DOMAIN is not set
    // to retain default single-host behaviour in local dev.
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
  res.cookie(SESSION_COOKIE, sid, cookieOpts);
}

function setOauthCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60 * 1000,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

function getGitHub(baseUrl: string): GitHub | null {
  const cfg = env();
  if (!cfg.GITHUB_CLIENT_ID || !cfg.GITHUB_CLIENT_SECRET) return null;
  return new GitHub(cfg.GITHUB_CLIENT_ID, cfg.GITHUB_CLIENT_SECRET, `${baseUrl}/api/auth/github/callback`);
}

function getGoogle(baseUrl: string): Google | null {
  const cfg = env();
  if (!cfg.GOOGLE_CLIENT_ID || !cfg.GOOGLE_CLIENT_SECRET) return null;
  return new Google(cfg.GOOGLE_CLIENT_ID, cfg.GOOGLE_CLIENT_SECRET, `${baseUrl}/api/auth/google/callback`);
}

async function upsertProviderUser(data: {
  provider: string;
  providerId: string;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
  githubUsername?: string | null;
}): Promise<AuthSessionUser> {
  const existing = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.provider, data.provider), eq(usersTable.providerId, data.providerId)))
    .limit(1);

  if (existing.length > 0) {
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (data.email) updateSet.email = data.email;
    if (data.emailVerified !== undefined) updateSet.emailVerified = data.emailVerified;
    if (data.displayName) updateSet.displayName = data.displayName;
    if (data.avatarUrl) updateSet.avatarUrl = data.avatarUrl;
    if (data.githubUsername) updateSet.githubUsername = data.githubUsername;

    const [updated] = await db
      .update(usersTable)
      .set(updateSet)
      .where(eq(usersTable.id, existing[0].id))
      .returning();
    return toSessionUser(updated);
  }

  if (data.email) {
    const byEmail = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, data.email))
      .limit(1);

    if (byEmail.length > 0) {
      const [updated] = await db
        .update(usersTable)
        .set({
          provider: data.provider,
          providerId: data.providerId,
          emailVerified: data.emailVerified ?? true,
          displayName: data.displayName || byEmail[0].displayName,
          avatarUrl: data.avatarUrl || byEmail[0].avatarUrl,
          githubUsername: data.githubUsername || null,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, byEmail[0].id))
        .returning();
      return toSessionUser(updated);
    }
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      provider: data.provider,
      providerId: data.providerId,
      email: data.email || null,
      emailVerified: data.emailVerified ?? false,
      displayName: data.displayName || null,
      avatarUrl: data.avatarUrl || null,
      githubUsername: data.githubUsername || null,
    })
    .returning();
  return toSessionUser(created);
}

function toSessionUser(user: typeof usersTable.$inferSelect): AuthSessionUser {
  return {
    id: user.id,
    provider: user.provider,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

router.get("/auth/user", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (!sid) {
    res.json({ user: null });
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    res.json({ user: null });
    return;
  }

  res.json({ user: session.user });
});

router.get("/auth/github", async (req: Request, res: Response) => {
  const baseUrl = getAppUrl(req);
  const gh = getGitHub(baseUrl);
  if (!gh) {
    logger.warn("GitHub OAuth not configured — GITHUB_CLIENT_ID/SECRET missing");
    res.redirect(`${baseUrl}/sign-in?error=provider_not_configured`);
    return;
  }

  const state = generateState();
  const returnTo = getSafeReturnTo(req.query.returnTo);

  const url = gh.createAuthorizationURL(state, ["user:email"]);

  setOauthCookie(res, "github_oauth_state", state);
  setOauthCookie(res, "oauth_return_to", returnTo);
  res.redirect(url.toString());
});

router.get("/auth/github/callback", async (req: Request, res: Response) => {
  const baseUrl = getAppUrl(req);
  const gh = getGitHub(baseUrl);
  if (!gh) {
    res.redirect(`${baseUrl}/sign-in?error=provider_not_configured`);
    return;
  }

  const { code, state } = req.query;
  const storedState = req.cookies?.github_oauth_state;
  const returnTo = getSafeReturnTo(req.cookies?.oauth_return_to);

  if (!code || !state || !storedState || state !== storedState) {
    res.redirect(`${baseUrl}/sign-in?error=oauth_state_mismatch`);
    return;
  }

  try {
    const tokens = await gh.validateAuthorizationCode(String(code));
    const accessToken = tokens.accessToken();

    const githubUser = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "AgentID/1.0" },
    }).then((r) => r.json()) as Record<string, unknown>;

    let email = githubUser.email as string | null;
    if (!email) {
      const emails = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "AgentID/1.0" },
      }).then((r) => r.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null;
    }

    const user = await upsertProviderUser({
      provider: "github",
      providerId: String(githubUser.id),
      email,
      emailVerified: true,
      displayName: (githubUser.name as string) || (githubUser.login as string) || null,
      avatarUrl: (githubUser.avatar_url as string) || null,
      githubUsername: (githubUser.login as string) || null,
    });

    const sessionData: SessionData = { user };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.clearCookie("github_oauth_state");
    res.clearCookie("oauth_return_to");
    res.redirect(returnTo);
  } catch (err) {
    logger.error({ err }, "GitHub OAuth callback error");
    res.redirect(`${baseUrl}/sign-in?error=oauth_failed`);
  }
});

router.get("/auth/google", async (req: Request, res: Response) => {
  const baseUrl = getAppUrl(req);
  const goog = getGoogle(baseUrl);
  if (!goog) {
    logger.warn("Google OAuth not configured — GOOGLE_CLIENT_ID/SECRET missing");
    res.redirect(`${baseUrl}/sign-in?error=provider_not_configured`);
    return;
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const returnTo = getSafeReturnTo(req.query.returnTo);

  const url = goog.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);

  setOauthCookie(res, "google_oauth_state", state);
  setOauthCookie(res, "google_code_verifier", codeVerifier);
  setOauthCookie(res, "oauth_return_to", returnTo);
  res.redirect(url.toString());
});

router.get("/auth/google/callback", async (req: Request, res: Response) => {
  const baseUrl = getAppUrl(req);
  const goog = getGoogle(baseUrl);
  if (!goog) {
    res.redirect(`${baseUrl}/sign-in?error=provider_not_configured`);
    return;
  }

  const { code, state } = req.query;
  const storedState = req.cookies?.google_oauth_state;
  const codeVerifier = req.cookies?.google_code_verifier;
  const returnTo = getSafeReturnTo(req.cookies?.oauth_return_to);

  if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
    res.redirect(`${baseUrl}/sign-in?error=oauth_state_mismatch`);
    return;
  }

  try {
    const tokens = await goog.validateAuthorizationCode(String(code), codeVerifier);
    const accessToken = tokens.accessToken();

    const googleUser = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((r) => r.json()) as Record<string, unknown>;

    const user = await upsertProviderUser({
      provider: "google",
      providerId: String(googleUser.sub),
      email: (googleUser.email as string) || null,
      emailVerified: Boolean(googleUser.email_verified),
      displayName: (googleUser.name as string) || null,
      avatarUrl: (googleUser.picture as string) || null,
    });

    const sessionData: SessionData = { user };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.clearCookie("google_oauth_state");
    res.clearCookie("google_code_verifier");
    res.clearCookie("oauth_return_to");
    res.redirect(returnTo);
  } catch (err) {
    logger.error({ err }, "Google OAuth callback error");
    res.redirect(`${baseUrl}/sign-in?error=oauth_failed`);
  }
});

router.post("/auth/magic-link/send", magicLinkSendRateLimit, async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "INVALID_EMAIL", message: "A valid email address is required", requestId: req.requestId ?? "unknown" });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicLinkTokensTable).values({
    email: email.toLowerCase().trim(),
    hashedToken,
    expiresAt,
  });

  const baseUrl = env().AUTH_BASE_URL || getAppUrl(req);
  // H2: Token is placed in the URL fragment (#) so it is never sent to the
  // server in GET requests and never appears in access logs or the Referer header.
  // The /magic-link page extracts it client-side and POSTs it to /api/auth/magic-link/verify.
  const magicUrl = `${baseUrl}/magic-link#token=${rawToken}`;

  try {
    await sendMagicLinkEmail(email, magicUrl);
  } catch (err) {
    logger.error({ err, email }, "Failed to send magic link email");
    res.status(500).json({ error: "EMAIL_SEND_FAILED", message: "Failed to send sign-in email. Please try again." });
    return;
  }

  res.json({ sent: true, email });
});

/**
 * H2: Shared magic-link redemption logic.
 * Token is hashed before the DB lookup so the plaintext never needs to be
 * compared directly and is never persisted (C1 fix).
 */
async function redeemMagicLinkToken(
  rawToken: string,
  req: Request,
  res: Response,
  isApiRequest: boolean,
): Promise<void> {
  const baseUrl = getAppUrl(req);
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const [record] = await db
    .select()
    .from(magicLinkTokensTable)
    .where(and(eq(magicLinkTokensTable.hashedToken, hashedToken), isNull(magicLinkTokensTable.usedAt)))
    .limit(1);

  if (!record || record.expiresAt < new Date()) {
    if (isApiRequest) {
      res.status(400).json({ error: "TOKEN_INVALID", message: "Magic link token is invalid or expired" });
    } else {
      res.redirect(`${baseUrl}/sign-in?error=token_expired`);
    }
    return;
  }

  await db
    .update(magicLinkTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(magicLinkTokensTable.id, record.id));

  const user = await upsertProviderUser({
    provider: "email",
    providerId: record.email,
    email: record.email,
    emailVerified: true,
    displayName: record.email.split("@")[0] || null,
  });

  const sessionData: SessionData = { user };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  if (isApiRequest) {
    res.json({ authenticated: true, redirectTo: `${baseUrl}/dashboard` });
  } else {
    res.redirect(`${baseUrl}/dashboard`);
  }
}

/**
 * H2: Preferred POST endpoint — token submitted in request body.
 * The email link sends the raw token in the URL fragment (#token=…), which is
 * never sent to the server. A small frontend script extracts it and calls this
 * endpoint via fetch/form POST, keeping the token out of server logs.
 */
router.post("/auth/magic-link/verify", async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "TOKEN_MISSING", message: "token is required" });
    return;
  }
  await redeemMagicLinkToken(token, req, res, true);
});

/**
 * GET /auth/magic-link/verify — kept for backwards compatibility with existing
 * email links already in users' inboxes. New emails use the fragment-based URL.
 * NOTE: The token appears in the query string on this path; prefer the POST
 * endpoint for new clients.
 */
router.get("/auth/magic-link/verify", async (req: Request, res: Response) => {
  const { token } = req.query;
  const baseUrl = getAppUrl(req);

  if (!token || typeof token !== "string") {
    res.redirect(`${baseUrl}/sign-in?error=invalid_token`);
    return;
  }

  await redeemMagicLinkToken(token, req, res, false);
});

router.post("/auth/signout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  const baseUrl = getAppUrl(req);
  res.redirect(`${baseUrl}/`);
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.redirect("/");
});

// ── Sign in with Agent ID ─────────────────────────────────────────────────────
// Uses our own OAuth server as the identity provider, so users who have a
// registered agent can sign back into the platform using that agent's identity.

router.get("/auth/agentid", async (req: Request, res: Response) => {
  const baseUrl = getAppUrl(req);
  const returnTo = getSafeReturnTo(req.query.returnTo);

  const codeVerifier  = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const state         = crypto.randomBytes(16).toString("hex");

  setOauthCookie(res, "agentid_code_verifier", codeVerifier);
  setOauthCookie(res, "agentid_state",          state);
  setOauthCookie(res, "oauth_return_to",         returnTo);

  const callbackUri = `${baseUrl}/api/auth/agentid/callback`;
  const params = new URLSearchParams({
    response_type:         "code",
    client_id:             "agclient_signin",
    redirect_uri:          callbackUri,
    scope:                 "read agents:read",
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: "S256",
  });

  res.redirect(`${baseUrl}/oauth/authorize?${params.toString()}`);
});

router.get("/auth/agentid/callback", async (req: Request, res: Response) => {
  const baseUrl = getAppUrl(req);
  const returnTo = getSafeReturnTo(req.cookies?.oauth_return_to);

  const { code, state, error } = req.query;

  if (error) {
    logger.warn({ error }, "Agent ID sign-in: user denied or provider error");
    res.redirect(`${baseUrl}/sign-in?error=oauth_failed`);
    return;
  }

  const storedState    = req.cookies?.agentid_state;
  const codeVerifier   = req.cookies?.agentid_code_verifier;

  if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
    res.redirect(`${baseUrl}/sign-in?error=oauth_state_mismatch`);
    return;
  }

  try {
    const callbackUri   = `${baseUrl}/api/auth/agentid/callback`;
    const tokenResult   = await exchangeAuthorizationCode(
      String(code),
      "agclient_signin",
      callbackUri,
      codeVerifier,
    );

    // Decode JWT (no verification needed — we just issued it) to get agent_id
    const jwtPayload = JSON.parse(
      Buffer.from(tokenResult.access_token.split(".")[1], "base64url").toString("utf-8"),
    ) as Record<string, unknown>;

    const agentId: string | undefined =
      (jwtPayload.agent_id as string | undefined) ??
      (typeof jwtPayload.sub === "string" ? jwtPayload.sub.split(":").pop() : undefined);

    if (!agentId) throw new Error("token missing agent_id claim");

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { id: true, userId: true, handle: true, displayName: true },
    });

    if (!agent?.userId) throw new Error("agent not found or has no owner");

    const userRow = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, agent.userId),
    });

    if (!userRow) throw new Error("user not found");

    const user = toSessionUser(userRow);
    const sid  = await createSession({ user } satisfies SessionData);
    setSessionCookie(res, sid);

    res.clearCookie("agentid_state");
    res.clearCookie("agentid_code_verifier");
    res.clearCookie("oauth_return_to");
    res.redirect(returnTo);
  } catch (err) {
    logger.error({ err }, "Agent ID sign-in callback error");
    res.redirect(`${baseUrl}/sign-in?error=oauth_failed`);
  }
});

export default router;
