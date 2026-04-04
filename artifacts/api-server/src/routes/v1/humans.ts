import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { humanProfilesTable, agentsTable } from "@workspace/db/schema";

const router = Router();

const claimSchema = z.object({
  handle: z.string().min(3).max(32).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  displayName: z.string().min(1).max(255),
  bio: z.string().max(2000).optional(),
});

router.post("/claim", requireAuth, async (req, res, next) => {
  try {
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const normalizedHandle = parsed.data.handle.toLowerCase();

    const existingProfile = await db.query.humanProfilesTable.findFirst({
      where: eq(humanProfilesTable.ownerUserId, req.userId!),
    });
    if (existingProfile) {
      throw new AppError(409, "ALREADY_CLAIMED", "You already have a human profile");
    }

    const existingHandle = await db.query.humanProfilesTable.findFirst({
      where: eq(humanProfilesTable.handle, normalizedHandle),
    });
    if (existingHandle) {
      throw new AppError(409, "HANDLE_TAKEN", "This handle is already claimed");
    }

    const agentWithHandle = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.handle, normalizedHandle),
    });
    if (agentWithHandle) {
      throw new AppError(409, "HANDLE_TAKEN", "This handle is already used by an agent");
    }

    const [profile] = await db
      .insert(humanProfilesTable)
      .values({
        handle: normalizedHandle,
        displayName: parsed.data.displayName,
        bio: parsed.data.bio,
        ownerUserId: req.userId!,
      })
      .returning();

    res.status(201).json(profile);
  } catch (err) {
    next(err);
  }
});

router.get("/:handle", async (req, res, next) => {
  try {
    const handle = req.params.handle.toLowerCase();
    const profile = await db.query.humanProfilesTable.findFirst({
      where: eq(humanProfilesTable.handle, handle),
    });
    if (!profile || !profile.isPublic) {
      throw new AppError(404, "NOT_FOUND", "Human profile not found");
    }

    const ownedAgents = await db.query.agentsTable.findMany({
      where: eq(agentsTable.userId, profile.ownerUserId),
      columns: {
        id: true,
        handle: true,
        displayName: true,
        description: true,
        avatarUrl: true,
        status: true,
        trustScore: true,
        verificationStatus: true,
        capabilities: true,
        isPublic: true,
      },
    });

    const publicAgents = ownedAgents.filter((a) => a.isPublic);

    res.json({
      ...profile,
      did: `did:web:getagent.id:humans:${profile.id}`,
      handleAlias: `did:agentid:human:${profile.handle}`,
      agents: publicAgents,
      agentCount: publicAgents.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
