import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, type User, type ApiKey } from "@workspace/db/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
      apiKey?: ApiKey;
    }
  }
}

async function upsertUser(
  replitUserId: string,
  replitUserName: string | undefined,
): Promise<User> {
  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.replitUserId, replitUserId),
  });

  if (existing) return existing;

  const [newUser] = await db
    .insert(usersTable)
    .values({
      replitUserId,
      username: replitUserName || undefined,
      displayName: replitUserName || undefined,
    })
    .returning();

  return newUser;
}

export async function replitAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const replitUserId = req.headers["x-replit-user-id"] as string | undefined;

  if (!replitUserId) {
    next();
    return;
  }

  try {
    const replitUserName = req.headers["x-replit-user-name"] as string | undefined;
    const user = await upsertUser(replitUserId, replitUserName);
    req.user = user;
    req.userId = user.id;
    next();
  } catch (err) {
    next(err);
  }
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
