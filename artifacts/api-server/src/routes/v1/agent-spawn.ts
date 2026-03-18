import { Router } from "express";
import { z } from "zod/v4";
import { randomBytes, createHash } from "crypto";
import { requireAgentAuth, requireScope } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import {
  validateHandle,
  isHandleAvailable,
} from "../../services/agents";
import { logActivity } from "../../services/activity-logger";
import { recomputeAndStore } from "../../services/trust-score";
import { getOrCreateInbox } from "../../services/mail";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentKeysTable,
  apiKeysTable,
  agentLineageTable,
} from "@workspace/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

const router = Router();

const spawnSchema = z.object({
  handle: z.string().min(3).max(100),
  displayName: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  agentType: z.enum(["subagent", "ephemeral"]).default("subagent"),
  ttlSeconds: z.number().int().positive().optional(),
  ttlHours: z.number().int().min(1).max(168).optional(),
  publicKey: z.string().min(1).optional(),
  keyType: z.string().default("ed25519"),
  capabilities: z.array(z.string()).max(50).optional(),
  protocols: z.array(z.string()).max(20).optional(),
  endpointUrl: z.url().optional(),
});

function generateKid(): string {
  return `kid_${randomBytes(12).toString("hex")}`;
}

function generateApiKey(): { raw: string; prefix: string; hashed: string } {
  const raw = `agk_${randomBytes(32).toString("hex")}`;
  const prefix = raw.slice(0, 8);
  const hashed = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hashed };
}

router.post("/:agentId/subagents", requireAgentAuth, requireScope("agents:spawn"), validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const parentAgent = req.authenticatedAgent!;
    const requestedParentId = req.params.agentId as string;

    if (parentAgent.id !== requestedParentId) {
      throw new AppError(403, "FORBIDDEN", "Agent key does not match the spawning agent");
    }

    if (parentAgent.verificationStatus !== "verified") {
      throw new AppError(403, "NOT_VERIFIED", "Only verified agents can spawn child agents");
    }

    const parsed = spawnSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { handle, displayName, publicKey, keyType, description, capabilities, protocols, endpointUrl, agentType, ttlSeconds, ttlHours } = parsed.data;
    const normalizedHandle = handle.toLowerCase();

    const handleError = validateHandle(normalizedHandle);
    if (handleError) {
      throw new AppError(400, "INVALID_HANDLE", handleError);
    }

    const available = await isHandleAvailable(normalizedHandle);
    if (!available) {
      throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
    }

    const ttlMs = ttlSeconds
      ? ttlSeconds * 1000
      : ttlHours
        ? ttlHours * 3600 * 1000
        : agentType === "ephemeral"
          ? 24 * 3600 * 1000
          : null;

    const lineageDepth = (parentAgent.lineageDepth ?? 0) + 1;
    const kid = generateKid();
    const apiKey = generateApiKey();
    const ttlExpiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;

    let spawnedByKeyId: string | undefined;
    const rawKey = req.headers["x-agent-key"] as string | undefined;
    if (rawKey) {
      const hashedKey = createHash("sha256").update(rawKey).digest("hex");
      const keyRecord = await db.query.apiKeysTable.findFirst({
        where: and(
          eq(apiKeysTable.hashedKey, hashedKey),
          eq(apiKeysTable.ownerType, "agent"),
          isNull(apiKeysTable.revokedAt),
        ),
        columns: { id: true },
      });
      if (keyRecord) {
        spawnedByKeyId = keyRecord.id;
      }
    }

    const result = await db.transaction(async (tx) => {
      const [updatedParent] = await tx
        .update(agentsTable)
        .set({
          subagentCount: sql`${agentsTable.subagentCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentsTable.id, parentAgent.id),
            sql`${agentsTable.subagentCount} < ${agentsTable.maxSubagents}`,
          ),
        )
        .returning({ subagentCount: agentsTable.subagentCount });

      if (!updatedParent) {
        throw new AppError(429, "MAX_SUBAGENTS_REACHED", `Maximum subagent limit reached`);
      }

      const [childAgent] = await tx
        .insert(agentsTable)
        .values({
          userId: parentAgent.userId,
          handle: normalizedHandle,
          displayName,
          description,
          capabilities: capabilities || [],
          protocols: protocols || [],
          endpointUrl,
          scopes: [],
          authMethods: [],
          paymentMethods: [],
          status: "active",
          agentType,
          parentAgentId: parentAgent.id,
          lineageDepth,
          sponsoredBy: parentAgent.id,
          ttlExpiresAt,
          spawnedByKeyId,
          verificationStatus: "verified",
          verificationMethod: "key_challenge",
          verifiedAt: new Date(),
        })
        .onConflictDoNothing({ target: agentsTable.handle })
        .returning();

      if (!childAgent) {
        await tx
          .update(agentsTable)
          .set({
            subagentCount: sql`GREATEST(${agentsTable.subagentCount} - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(agentsTable.id, parentAgent.id));
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }

      if (publicKey) {
        await tx
          .insert(agentKeysTable)
          .values({
            agentId: childAgent.id,
            kid,
            keyType,
            publicKey,
            use: "sig",
          });
      }

      await tx.insert(apiKeysTable).values({
        ownerType: "agent",
        ownerId: childAgent.id,
        name: `${normalizedHandle}-spawn-key`,
        keyPrefix: apiKey.prefix,
        hashedKey: apiKey.hashed,
        scopes: ["agent:read", "agent:write", "agent:spawn"],
      });

      const parentLineage = await tx
        .select()
        .from(agentLineageTable)
        .where(eq(agentLineageTable.agentId, parentAgent.id));

      const lineageEntries = [
        { agentId: childAgent.id, ancestorId: parentAgent.id, depth: 1 },
      ];
      for (const entry of parentLineage) {
        lineageEntries.push({
          agentId: childAgent.id,
          ancestorId: entry.ancestorId,
          depth: entry.depth + 1,
        });
      }

      if (lineageEntries.length > 0) {
        await tx.insert(agentLineageTable).values(lineageEntries);
      }

      return { childAgent };
    });

    const response: Record<string, unknown> = {
      agentId: result.childAgent.id,
      handle: normalizedHandle,
      status: "active",
      agentType,
      parentAgentId: parentAgent.id,
      lineageDepth,
      apiKey: apiKey.raw,
    };

    if (publicKey) {
      response.kid = kid;
    }

    if (ttlExpiresAt && ttlMs) {
      response.ttl = {
        expiresAt: ttlExpiresAt.toISOString(),
        remainingSeconds: Math.floor(ttlMs / 1000),
        isEphemeral: true,
      };
    }

    res.status(201).json(response);

    Promise.allSettled([
      getOrCreateInbox(result.childAgent.id),
      recomputeAndStore(result.childAgent.id),
      logActivity({
        agentId: result.childAgent.id,
        eventType: "agent.spawned",
        payload: {
          parentAgentId: parentAgent.id,
          parentHandle: parentAgent.handle,
          lineageDepth,
          agentType,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }),
      logActivity({
        agentId: parentAgent.id,
        eventType: "agent.spawned_child",
        payload: {
          childAgentId: result.childAgent.id,
          childHandle: normalizedHandle,
          agentType,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }),
    ]).catch(() => {});
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/subagents", requireAgentAuth, requireScope("agents:read"), validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const parentAgent = req.authenticatedAgent!;
    const requestedParentId = req.params.agentId as string;

    if (parentAgent.id !== requestedParentId) {
      throw new AppError(403, "FORBIDDEN", "Agent key does not match this agent");
    }

    const statusFilter = req.query.status as string | undefined;
    const typeFilter = req.query.agentType as string | undefined;

    const validStatuses = new Set(["draft", "active", "inactive", "suspended", "pending_verification"]);
    const conditions = [eq(agentsTable.parentAgentId, parentAgent.id)];

    if (statusFilter) {
      if (!validStatuses.has(statusFilter)) {
        throw new AppError(400, "VALIDATION_ERROR", `Invalid status filter: ${statusFilter}`);
      }
      conditions.push(eq(agentsTable.status, statusFilter as "draft" | "active" | "inactive" | "suspended" | "pending_verification"));
    }

    if (typeFilter) {
      if (typeFilter !== "subagent" && typeFilter !== "ephemeral") {
        throw new AppError(400, "VALIDATION_ERROR", `Invalid agentType filter: ${typeFilter}`);
      }
      conditions.push(eq(agentsTable.agentType, typeFilter));
    }

    const subagents = await db.query.agentsTable.findMany({
      where: and(...conditions),
      columns: {
        id: true,
        handle: true,
        displayName: true,
        status: true,
        agentType: true,
        lineageDepth: true,
        ttlExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const now = Date.now();
    const enriched = subagents.map((sa) => ({
      ...sa,
      ttl: sa.ttlExpiresAt
        ? {
            expiresAt: sa.ttlExpiresAt.toISOString(),
            remainingSeconds: Math.max(0, Math.floor((sa.ttlExpiresAt.getTime() - now) / 1000)),
            isExpired: sa.ttlExpiresAt.getTime() <= now,
            isEphemeral: sa.agentType === "ephemeral",
          }
        : null,
    }));

    res.json({
      parentAgentId: parentAgent.id,
      subagents: enriched,
      total: enriched.length,
      maxSubagents: parentAgent.maxSubagents,
      subagentCount: parentAgent.subagentCount,
    });
  } catch (err) {
    next(err);
  }
});

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.delete("/:agentId/subagents/:subagentId", requireAgentAuth, requireScope("agents:spawn"), validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const parentAgent = req.authenticatedAgent!;
    const requestedParentId = req.params.agentId as string;
    const subagentId = req.params.subagentId as string;

    if (!uuidRe.test(subagentId)) {
      throw new AppError(400, "INVALID_ID", "subagentId must be a valid UUID");
    }

    if (parentAgent.id !== requestedParentId) {
      throw new AppError(403, "FORBIDDEN", "Agent key does not match this agent");
    }

    const subagent = await db.query.agentsTable.findFirst({
      where: and(
        eq(agentsTable.id, subagentId),
        eq(agentsTable.parentAgentId, parentAgent.id),
      ),
    });

    if (!subagent) {
      throw new AppError(404, "NOT_FOUND", "Subagent not found or does not belong to this parent");
    }

    if (subagent.status === "inactive") {
      throw new AppError(409, "ALREADY_TERMINATED", "Subagent is already terminated");
    }

    await db.transaction(async (tx) => {
      const [terminated] = await tx
        .update(agentsTable)
        .set({
          status: "inactive",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentsTable.id, subagentId),
            sql`${agentsTable.status} != 'inactive'`,
          ),
        )
        .returning({ id: agentsTable.id });

      if (terminated) {
        await tx
          .update(agentsTable)
          .set({
            subagentCount: sql`GREATEST(${agentsTable.subagentCount} - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(agentsTable.id, parentAgent.id));

        await tx
          .update(apiKeysTable)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(apiKeysTable.ownerId, subagentId),
              eq(apiKeysTable.ownerType, "agent"),
              isNull(apiKeysTable.revokedAt),
            ),
          );
      }
    });

    await logActivity({
      agentId: subagentId,
      eventType: "agent.terminated",
      payload: {
        terminatedBy: parentAgent.id,
        parentHandle: parentAgent.handle,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      subagentId,
      status: "inactive",
      terminatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
