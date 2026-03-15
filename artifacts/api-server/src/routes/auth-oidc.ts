import * as oidc from "openid-client";
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
  type AuthSessionUser,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }
  return value;
}

async function upsertUser(
  claims: Record<string, unknown>,
): Promise<AuthSessionUser> {
  const replitUserId = claims.sub as string;
  const username =
    (claims.username as string) ||
    (claims.preferred_username as string) ||
    (claims.first_name as string) ||
    null;
  const displayName =
    (claims.name as string) ||
    [claims.first_name, claims.last_name].filter(Boolean).join(" ") ||
    username ||
    null;
  const email = (claims.email as string) || null;
  const avatarUrl =
    (claims.profile_image_url as string) ||
    (claims.picture as string) ||
    null;

  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (username) updateSet.username = username;
  if (displayName) updateSet.displayName = displayName;
  if (email) updateSet.email = email;
  if (avatarUrl) updateSet.avatarUrl = avatarUrl;

  const [user] = await db
    .insert(usersTable)
    .values({
      replitUserId,
      username: username || undefined,
      displayName: displayName || undefined,
      email: email || undefined,
      avatarUrl: avatarUrl || undefined,
    })
    .onConflictDoUpdate({
      target: usersTable.replitUserId,
      set: updateSet,
    })
    .returning();

  return {
    id: user.id,
    replitUserId: user.replitUserId,
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

  const userData = { ...session.user };
  if (process.env.NODE_ENV === "production") {
    delete (userData as Record<string, unknown>).replitUserId;
  }
  res.json({ user: userData });
});

router.get("/login", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;

    const returnTo = getSafeReturnTo(req.query.returnTo);

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    const redirectTo = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: "openid email profile offline_access",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login consent",
      state,
      nonce,
    });

    setOidcCookie(res, "code_verifier", codeVerifier);
    setOidcCookie(res, "nonce", nonce);
    setOidcCookie(res, "state", state);
    setOidcCookie(res, "return_to", returnTo);

    res.redirect(redirectTo.href);
  } catch (err) {
    console.error("OIDC login error:", err);
    res.redirect("/?error=login_failed");
  }
});

router.get("/callback", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;

    const codeVerifier = req.cookies?.code_verifier;
    const nonce = req.cookies?.nonce;
    const expectedState = req.cookies?.state;
    const returnTo = getSafeReturnTo(req.cookies?.return_to);

    if (!codeVerifier || !expectedState) {
      res.redirect("/api/login");
      return;
    }

    const currentUrl = new URL(
      `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
    );

    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });

    const claims = tokens.claims();
    if (!claims) {
      res.redirect("/?error=no_claims");
      return;
    }

    const user = await upsertUser(
      claims as unknown as Record<string, unknown>,
    );

    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      user,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiresIn()
        ? now + tokens.expiresIn()!
        : (claims.exp as number | undefined),
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    for (const name of ["code_verifier", "nonce", "state", "return_to"]) {
      res.clearCookie(name, { path: "/" });
    }

    res.redirect(returnTo);
  } catch (err) {
    console.error("OIDC callback error:", err);
    res.redirect("/?error=auth_failed");
  }
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.redirect("/");
});

export default router;
