import { Router } from "express";
import { z } from "zod/v4";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { waitlistTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { AppError } from "../../middlewares/error-handler";

const router = Router();

const joinSchema = z.object({
  email: z.email().max(320),
  source: z.string().max(50).optional(),
  referrer: z.string().max(2000).optional(),
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Please provide a valid email address.");
    }

    const { email, source, referrer } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const ipHash = req.ip
      ? createHash("sha256").update(req.ip).digest("hex").slice(0, 16)
      : null;

    const existing = await db.query.waitlistTable.findFirst({
      where: eq(waitlistTable.email, normalizedEmail),
    });

    if (existing) {
      res.json({
        success: true,
        message: "You're already on the list.",
        position: null,
      });
      return;
    }

    await db.insert(waitlistTable).values({
      email: normalizedEmail,
      source: source || "website",
      ipHash,
      userAgent: (req.headers["user-agent"] || "").slice(0, 500),
      referrer: referrer || (req.headers.referer || "").slice(0, 2000) || null,
    });

    res.status(201).json({
      success: true,
      message: "You're on the list.",
    });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    if (
      err instanceof Error &&
      err.message.includes("duplicate key")
    ) {
      res.json({ success: true, message: "You're already on the list." });
      return;
    }
    next(err);
  }
});

export default router;
