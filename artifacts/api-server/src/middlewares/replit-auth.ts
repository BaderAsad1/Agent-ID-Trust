import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, type User } from "@workspace/db/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

export function replitAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const replitUserId = req.headers["x-replit-user-id"] as string | undefined;
  const replitUserName = req.headers["x-replit-user-name"] as string | undefined;
  const replitUserRoles = req.headers["x-replit-user-roles"] as string | undefined;

  if (replitUserId) {
    (req as any)._replitUserId = replitUserId;
    (req as any)._replitUserName = replitUserName;
    (req as any)._replitUserRoles = replitUserRoles;
  }

  next();
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user) {
    next();
    return;
  }

  const replitUserId = (req as any)._replitUserId as string | undefined;

  if (!replitUserId) {
    res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
    return;
  }

  try {
    const replitUserName = (req as any)._replitUserName as string | undefined;

    const existing = await db.query.usersTable.findFirst({
      where: eq(usersTable.replitUserId, replitUserId),
    });

    if (existing) {
      req.user = existing;
      req.userId = existing.id;
    } else {
      const [newUser] = await db
        .insert(usersTable)
        .values({
          replitUserId,
          username: replitUserName || undefined,
          displayName: replitUserName || undefined,
        })
        .returning();
      req.user = newUser;
      req.userId = newUser.id;
    }

    next();
  } catch (err) {
    next(err);
  }
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const replitUserId = (req as any)._replitUserId as string | undefined;

  if (!replitUserId) {
    next();
    return;
  }

  db.query.usersTable
    .findFirst({
      where: eq(usersTable.replitUserId, replitUserId),
    })
    .then((existing) => {
      if (existing) {
        req.user = existing;
        req.userId = existing.id;
      }
      next();
    })
    .catch(next);
}
