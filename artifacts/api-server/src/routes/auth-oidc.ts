import { Router, type Request, type Response } from "express";
import { GitHub, Google, generateState, generateCodeVerifier } from "arctic";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, magicLinkTokensTable } from "@workspace/db/schema";
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
  const cfg = env();
  const cookieOpts: import("express").CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  };
  if (cfg.COOKIE_DOMAIN) {
    cookieOpts.domain = cfg.COOKIE_DOMAIN;
  }
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
  const { email, returnTo: rawReturnTo } = req.body as { email?: string; returnTo?: string };
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "INVALID_EMAIL", message: "A valid email address is required", requestId: req.requestId ?? "unknown" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicLinkTokensTable).values({
    email: email.toLowerCase().trim(),
    token: hashedToken,
    expiresAt,
  });

  const baseUrl = env().AUTH_BASE_URL || getAppUrl(req);
  const safeReturnTo = getSafeReturnTo(rawReturnTo);
  const returnToParam = safeReturnTo !== "/" ? `?returnTo=${encodeURIComponent(safeReturnTo)}` : "";
  const magicUrl = `${baseUrl}/magic-link${returnToParam}#token=${token}`;

  try {
    await sendMagicLinkEmail(email, magicUrl);
  } catch (err) {
    logger.error({ err, email }, "Failed to send magic link email");
  }

  res.json({ sent: true, email });
});

router.post("/auth/magic-link/verify", async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "INVALID_TOKEN", message: "Token is required", requestId: req.requestId ?? "unknown" });
    return;
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const [record] = await db
    .select()
    .from(magicLinkTokensTable)
    .where(and(eq(magicLinkTokensTable.token, hashedToken), isNull(magicLinkTokensTable.usedAt)))
    .limit(1);

  if (!record || record.expiresAt < new Date()) {
    res.status(400).json({ error: "TOKEN_EXPIRED", message: "Token is invalid or expired", requestId: req.requestId ?? "unknown" });
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
  res.json({ success: true, user: { id: user.id, email: user.email } });
});

router.get("/auth/magic-link/verify", async (req: Request, res: Response) => {
  const { token } = req.query;
  const baseUrl = getAppUrl(req);

  if (!token || typeof token !== "string") {
    res.redirect(`${baseUrl}/sign-in?error=invalid_token`);
    return;
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const [record] = await db
    .select()
    .from(magicLinkTokensTable)
    .where(and(eq(magicLinkTokensTable.token, hashedToken), isNull(magicLinkTokensTable.usedAt)))
    .limit(1);

  if (!record || record.expiresAt < new Date()) {
    res.redirect(`${baseUrl}/sign-in?error=token_expired`);
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
  res.redirect(`${baseUrl}/dashboard`);
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

export default router;
