import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { userIdentitiesTable } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { z } from "zod/v4";

const router = Router();

const linkIdentitySchema = z.object({
  provider: z.literal("github").or(z.literal("google")).or(z.literal("wallet")),
  providerUserId: z.string().min(1).max(255),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const identities = await db.query.userIdentitiesTable.findMany({
      where: eq(userIdentitiesTable.userId, req.user!.id),
    });

    res.json({ identities });
  } catch (err) {
    next(err);
  }
});

router.post("/link", requireAuth, async (req, res, next) => {
  try {
    const parsed = linkIdentitySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { provider, providerUserId, metadata } = parsed.data;

    const [identity] = await db
      .insert(userIdentitiesTable)
      .values({
        userId: req.user!.id,
        provider,
        providerUserId,
        metadata: metadata || null,
      })
      .onConflictDoNothing()
      .returning();

    if (!identity) {
      throw new AppError(409, "CONFLICT", "This identity is already linked");
    }

    res.status(201).json(identity);
  } catch (err) {
    next(err);
  }
});

export default router;
