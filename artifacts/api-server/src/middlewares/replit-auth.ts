import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { usersTable, humanAuditLogTable, type User, type ApiKey } from "@workspace/db/schema";
import { logger } from "./request-logger";
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
  } catch (err) {
    logger.warn({ err }, "[auth] Session load failed");
  }
  next();
}

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function sanitizeBodyMetadata(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  const SENSITIVE_KEYS = new Set(["password", "secret", "token", "key", "apiKey", "api_key", "authorization", "credit_card", "cvv"]);
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.has(lower)) {
      sanitized[k] = "[redacted]";
    } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
      sanitized[k] = v;
    } else {
      sanitized[k] = typeof v;
    }
  }
  return sanitized;
}

function extractResourceInfo(req: Request): { resourceType: string | null; resourceId: string | null } {
  const parts = req.path.split("/").filter(Boolean);
  if (parts.length === 0) return { resourceType: null, resourceId: null };
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (let i = 0; i < parts.length - 1; i++) {
    if (UUID_RE.test(parts[i + 1])) {
      return { resourceType: parts[i], resourceId: parts[i + 1] };
    }
  }
  if (UUID_RE.test(parts[parts.length - 1])) {
    return { resourceType: parts[parts.length - 2] ?? null, resourceId: parts[parts.length - 1] };
  }
  return { resourceType: parts[0] ?? null, resourceId: null };
}

async function writeAuditLog(req: Request, userId: string): Promise<void> {
  try {
    const action = `${req.method} ${req.path}`;
    const { resourceType, resourceId } = extractResourceInfo(req);
    const hashedIp = hashIp(req.ip);
    const userAgent = req.headers["user-agent"] ?? null;
    const bodyMetadata = sanitizeBodyMetadata(req.body);

    await db.insert(humanAuditLogTable).values({
      userId,
      action,
      resourceType,
      resourceId,
      hashedIp,
      userAgent,
      bodyMetadata,
    });
  } catch {
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user) {
    writeAuditLog(req, req.user.id).catch(() => {});
    next();
    return;
  }

  res.status(401).json({
    error: "Authentication required",
    code: "UNAUTHORIZED",
  });
}
