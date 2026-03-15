import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, type User, type ApiKey } from "@workspace/db/schema";
import { getSessionId, getSession, type AuthSessionUser } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
      apiKey?: ApiKey;
      replitRoles?: string;
    }
  }
}

interface ReplitHeaders {
  replitUserId: string;
  replitUserName?: string;
  replitUserProfileImage?: string;
  replitUserRoles?: string;
}

async function upsertUser(headers: ReplitHeaders): Promise<User> {
  const { replitUserId, replitUserName, replitUserProfileImage } = headers;

  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (replitUserName) {
    updateSet.username = replitUserName;
    updateSet.displayName = replitUserName;
  }
  if (replitUserProfileImage) {
    updateSet.avatarUrl = replitUserProfileImage;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      replitUserId,
      username: replitUserName || undefined,
      displayName: replitUserName || undefined,
      avatarUrl: replitUserProfileImage || undefined,
    })
    .onConflictDoUpdate({
      target: usersTable.replitUserId,
      set: updateSet,
    })
    .returning();

  return user;
}

async function loadUserFromSession(req: Request): Promise<User | null> {
  const sid = getSessionId(req);
  if (!sid) return null;

  const session = await getSession(sid);
  if (!session?.user?.id) return null;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.user.id));

  return user || null;
}

export async function replitAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  let replitUserId = req.headers["x-replit-user-id"] as string | undefined;
  if (!replitUserId && process.env.NODE_ENV !== "production") {
    replitUserId = req.headers["x-agentid-user-id"] as string | undefined;
  }

  if (replitUserId) {
    try {
      const replitUserName = req.headers["x-replit-user-name"] as string | undefined;
      const replitUserProfileImage = req.headers["x-replit-user-profile-image"] as string | undefined;
      const replitUserRoles = req.headers["x-replit-user-roles"] as string | undefined;

      const user = await upsertUser({
        replitUserId,
        replitUserName,
        replitUserProfileImage,
        replitUserRoles,
      });

      req.user = user;
      req.userId = user.id;
      req.replitRoles = replitUserRoles;
      next();
      return;
    } catch (err) {
      next(err);
      return;
    }
  }

  try {
    const user = await loadUserFromSession(req);
    if (user) {
      req.user = user;
      req.userId = user.id;
    }
  } catch {}

  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user) {
    next();
    return;
  }

  res.status(401).json({
    error: "Authentication required",
    code: "UNAUTHORIZED",
  });
}
