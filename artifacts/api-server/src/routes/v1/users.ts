import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { z } from "zod/v4";

const router = Router();

const updateUserSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  email: z.email().optional(),
  avatarUrl: z.url().optional(),
  username: z.string().min(1).max(255).optional(),
});

router.get("/me", requireAuth, (req, res) => {
  const user = req.user!;
  res.json(user);
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

export default router;
