import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { verifyApiKey } from "../services/api-keys";

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  const isUserKey = token.startsWith("aid_") || token.startsWith("agk_sandbox_");
  if (!isUserKey) {
    next();
    return;
  }

  try {
    const apiKey = await verifyApiKey(token);
    if (!apiKey) {
      res.status(401).json({
        error: "Invalid or revoked API key",
        code: "INVALID_API_KEY",
      });
      return;
    }

    req.apiKey = apiKey;

    if (apiKey.ownerType === "user") {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, apiKey.ownerId),
      });
      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}
