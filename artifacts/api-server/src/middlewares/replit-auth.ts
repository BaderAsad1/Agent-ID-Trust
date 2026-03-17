import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, type User, type ApiKey } from "@workspace/db/schema";
import { getSessionId, getSession } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
      apiKey?: ApiKey;
    }
  }
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
