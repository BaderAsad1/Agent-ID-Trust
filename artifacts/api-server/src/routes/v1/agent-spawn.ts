import { Router } from "express";
import { z } from "zod/v4";
import { randomBytes, createHash } from "crypto";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import {
  validateHandle,
  isHandleAvailable,
} from "../../services/agents";
import { logActivity } from "../../services/activity-logger";
import { recomputeAndStore } from "../../services/trust-score";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentKeysTable,
  apiKeysTable,
  agentVerificationChallengesTable,
} from "@workspace/db/schema";

const router = Router();

const spawnSchema = z.object({
  handle: z.string().min(3).max(100),
  displayName: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  publicKey: z.string().min(1),
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

const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000;

router.post("/:agentId/spawn", requireAgentAuth, async (req, res, next) => {
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

    const { handle, displayName, publicKey, keyType, description, capabilities, protocols, endpointUrl } = parsed.data;
    const normalizedHandle = handle.toLowerCase();

    const handleError = validateHandle(normalizedHandle);
    if (handleError) {
      throw new AppError(400, "INVALID_HANDLE", handleError);
    }

    const available = await isHandleAvailable(normalizedHandle);
    if (!available) {
      throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
    }

    const lineageDepth = (parentAgent.lineageDepth ?? 0) + 1;
    const kid = generateKid();
    const apiKey = generateApiKey();
    const challengeToken = randomBytes(32).toString("hex");
    const challengeExpiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MS);

    const result = await db.transaction(async (tx) => {
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
          status: "pending_verification",
          parentAgentId: parentAgent.id,
          lineageDepth,
          sponsoredBy: parentAgent.id,
          verificationStatus: "pending_verification",
        })
        .onConflictDoNothing({ target: agentsTable.handle })
        .returning();

      if (!childAgent) {
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }

      const [agentKey] = await tx
        .insert(agentKeysTable)
        .values({
          agentId: childAgent.id,
          kid,
          keyType,
          publicKey,
          use: "sig",
        })
        .returning();

      await tx.insert(apiKeysTable).values({
        ownerType: "agent",
        ownerId: childAgent.id,
        name: `${normalizedHandle}-spawn-key`,
        keyPrefix: apiKey.prefix,
        hashedKey: apiKey.hashed,
        scopes: ["agent:spawn"],
      });

      const [challenge] = await tx
        .insert(agentVerificationChallengesTable)
        .values({
          agentId: childAgent.id,
          challenge: challengeToken,
          method: "key_challenge",
          expiresAt: challengeExpiresAt,
        })
        .returning();

      return { childAgent, agentKey, challenge };
    });

    await logActivity({
      agentId: result.childAgent.id,
      eventType: "agent.spawned",
      payload: {
        parentAgentId: parentAgent.id,
        parentHandle: parentAgent.handle,
        lineageDepth,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await logActivity({
      agentId: parentAgent.id,
      eventType: "agent.spawned_child",
      payload: {
        childAgentId: result.childAgent.id,
        childHandle: normalizedHandle,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await recomputeAndStore(result.childAgent.id);

    res.status(201).json({
      agentId: result.childAgent.id,
      handle: normalizedHandle,
      status: "pending_verification",
      parentAgentId: parentAgent.id,
      lineageDepth,
      kid: result.agentKey.kid,
      apiKey: apiKey.raw,
      challenge: result.challenge.challenge,
      expiresAt: result.challenge.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
