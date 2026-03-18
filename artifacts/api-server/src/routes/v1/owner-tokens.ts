import { Router } from "express";
import { randomBytes, createHash } from "crypto";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { db } from "@workspace/db";
import { ownerTokensTable, agentsTable, apiKeysTable } from "@workspace/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

export const ownerTokenRouter = Router();
export const agentLinkOwnerRouter = Router();

ownerTokenRouter.post("/generate", requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!;

    await db
      .update(ownerTokensTable)
      .set({ used: true })
      .where(and(eq(ownerTokensTable.userId, userId), eq(ownerTokensTable.used, false)));

    const token = `aid_${randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [record] = await db.insert(ownerTokensTable).values({
      token,
      userId,
      expiresAt,
    }).returning();

    res.status(201).json({
      token: record.token,
      expiresAt: record.expiresAt,
      validForHours: 24,
    });
  } catch (err) {
    next(err);
  }
});

agentLinkOwnerRouter.post("/link-owner", async (req, res, next) => {
  try {
    const agentKey = req.headers["x-api-key"] as string | undefined;
    if (!agentKey) {
      throw new AppError(401, "UNAUTHORIZED", "Agent API key required (x-api-key header)");
    }

    const { token } = req.body as { token?: string };
    if (!token) {
      throw new AppError(400, "VALIDATION_ERROR", "token is required");
    }

    const hashedKey = createHash("sha256").update(agentKey).digest("hex");

    const keyRecord = await db.query.apiKeysTable.findFirst({
      where: and(
        eq(apiKeysTable.hashedKey, hashedKey),
        eq(apiKeysTable.ownerType, "agent"),
        isNull(apiKeysTable.revokedAt),
      ),
    });

    if (!keyRecord) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid or revoked agent API key");
    }

    const agentId = keyRecord.ownerId;

    const agentRecord = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });

    if (!agentRecord) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    if (agentRecord.revokedAt) {
      throw new AppError(403, "AGENT_REVOKED", "This agent has been revoked and cannot be linked");
    }

    // Prevent duplicate claim overwrite: once an agent is claimed it belongs to
    // its owner. A second link-owner attempt via a different token must be
    // handled through an explicit admin dispute path, not the normal flow.
    if (agentRecord.isClaimed) {
      throw new AppError(409, "ALREADY_CLAIMED", "This agent is already linked to an owner. Use the dispute path to challenge ownership.");
    }

    if (agentRecord.verificationStatus !== "verified") {
      throw new AppError(403, "AGENT_NOT_VERIFIED", "Agent must complete verification before it can be linked to an owner. This prevents pre-claiming of agent slots.", {
        verificationStatus: agentRecord.verificationStatus,
      });
    }

    const ownerToken = await db.query.ownerTokensTable.findFirst({
      where: and(
        eq(ownerTokensTable.token, token),
        eq(ownerTokensTable.used, false),
      ),
    });

    if (!ownerToken) {
      throw new AppError(404, "TOKEN_NOT_FOUND", "Owner token not found or already used");
    }

    if (new Date() > ownerToken.expiresAt) {
      throw new AppError(410, "TOKEN_EXPIRED", "Owner token has expired");
    }

    await db.transaction(async (tx) => {
      // Atomic claim guard: the WHERE clause includes isClaimed = false so that
      // a concurrent request that races past the earlier pre-check above will
      // still fail to update the row (0 rows affected = claim lost the race).
      const result = await tx
        .update(agentsTable)
        .set({
          ownerUserId: ownerToken.userId,
          isClaimed: true,
          claimedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(agentsTable.id, agentId), sql`${agentsTable.isClaimed} = false`))
        .returning({ id: agentsTable.id });

      if (result.length === 0) {
        // Another concurrent request claimed the agent between our read and this write.
        throw new AppError(409, "ALREADY_CLAIMED", "This agent was claimed by another request. Only one owner can be linked.");
      }

      await tx
        .update(ownerTokensTable)
        .set({ used: true })
        .where(eq(ownerTokensTable.id, ownerToken.id));
    });

    res.json({
      success: true,
      agentId,
      linkedUserId: ownerToken.userId,
      linkedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
