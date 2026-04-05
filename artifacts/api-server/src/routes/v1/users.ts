import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, apiKeysTable, marketplaceListingsTable, agentsTable } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { env } from "../../lib/env";
import { z } from "zod/v4";
import { recoveryRateLimit } from "../../middlewares/rate-limit";

const router = Router();

const updateUserSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  email: z.email().optional(),
  avatarUrl: z.url().optional(),
  username: z.string().min(1).max(255).optional(),
});

router.get("/me", requireAuth, (req, res) => {
  const user = req.user!;
  const response: Record<string, unknown> = { ...user };
  if (env().NODE_ENV === "production") {
    delete response.replitUserId;
  }
  res.json(response);
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "No fields to update");
    }

    const [updated] = await db
      .update(usersTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Account deletion is rate-limited aggressively (5 req per 10 min) to prevent CSRF/session-theft abuse.
// The `recoveryRateLimit` (5/10min) is intentionally reused — it matches the sensitivity of this operation.
router.delete("/me", requireAuth, recoveryRateLimit, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    await db.transaction(async (tx) => {
      await tx.delete(marketplaceListingsTable).where(eq(marketplaceListingsTable.userId, userId));
      await tx.delete(apiKeysTable).where(and(eq(apiKeysTable.ownerType, "user"), eq(apiKeysTable.ownerId, userId)));
      await tx.delete(agentsTable).where(eq(agentsTable.userId, userId));
      await tx.delete(usersTable).where(eq(usersTable.id, userId));
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
