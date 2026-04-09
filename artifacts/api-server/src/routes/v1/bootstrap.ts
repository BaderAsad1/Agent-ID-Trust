import { Router } from "express";
import { z } from "zod/v4";
import { randomBytes, createHash, createPublicKey } from "crypto";
import { hashClaimToken } from "../../utils/crypto";

// Normalize any valid ed25519 public key representation to base64-encoded DER SPKI.
// Accepts: raw 32-byte base64/base64url, PEM, or DER SPKI base64 (pass-through).
function normalizeEd25519PublicKey(publicKey: string): string {
  const trimmed = publicKey.trim();

  // PEM format
  if (trimmed.startsWith("-----BEGIN")) {
    const key = createPublicKey({ key: trimmed, format: "pem" });
    return (key.export({ type: "spki", format: "der" }) as Buffer).toString("base64");
  }

  // base64 / base64url → try to detect raw 32-byte key
  const b64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(b64, "base64");

  if (decoded.length === 32) {
    // Raw ed25519 public key — wrap in DER SPKI header (OID 1.3.101.112)
    const spkiHeader = Buffer.from("302a300506032b6570032100", "hex");
    return Buffer.concat([spkiHeader, decoded]).toString("base64");
  }

  // Assume already DER SPKI base64 — return normalised (no padding issues)
  return b64;
}
import { AppError } from "../../middlewares/error-handler";
import { logger } from "../../middlewares/request-logger";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentClaimTokensTable,
  agentKeysTable,
  apiKeysTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAgentById } from "../../services/agents";
import { createAgentKey } from "../../services/agent-keys";
import { createChallenge, verifyChallenge } from "../../services/verification";
import { buildBootstrapBundle } from "../../services/identity";
import { recomputeAndStore } from "../../services/trust-score";
import { logActivity } from "../../services/activity-logger";
import { getOrCreateInbox } from "../../services/mail";
import { formatDomain, formatHandle } from "../../utils/handle";
import { getUserPlan, getPlanLimits } from "../../services/billing";
import { registrationRateLimitStrict, challengeRateLimit, resolutionRateLimit } from "../../middlewares/rate-limit";

const router = Router();

const claimSchema = z.object({
  token: z.string().min(1).max(1024),
  publicKey: z.string().min(1).max(2048),
  keyType: z.enum(["ed25519"]).default("ed25519"),
});

const activateSchema = z.object({
  agentId: z.string().uuid(),
  kid: z.string().min(1),
  challenge: z.string().min(1),
  signature: z.string().min(1),
  claimToken: z.string().min(1).max(1024),
});

function generateAgentApiKey(): { raw: string; prefix: string; hashed: string } {
  const raw = `agk_${randomBytes(32).toString("hex")}`;
  const prefix = raw.slice(0, 8);
  const hashed = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hashed };
}

router.post("/claim", registrationRateLimitStrict, async (req, res, next) => {
  try {
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { token, keyType } = parsed.data;
    let publicKey: string;
    try {
      publicKey = normalizeEd25519PublicKey(parsed.data.publicKey);
    } catch {
      throw new AppError(400, "INVALID_KEY", "publicKey is not a valid Ed25519 public key. Provide a raw 32-byte base64 key, a PEM public key, or a DER SPKI base64 key.");
    }

    const hashedToken = hashClaimToken(token);
    const claimRecord = await db.query.agentClaimTokensTable.findFirst({
      where: and(
        eq(agentClaimTokensTable.token, hashedToken),
        eq(agentClaimTokensTable.isActive, true),
        eq(agentClaimTokensTable.isUsed, false),
      ),
    });

    if (!claimRecord) {
      throw new AppError(404, "TOKEN_NOT_FOUND", "Claim token not found, already used, or deactivated");
    }

    if (claimRecord.expiresAt && claimRecord.expiresAt < new Date()) {
      throw new AppError(410, "TOKEN_EXPIRED", "This claim token has expired");
    }

    const agent = await getAgentById(claimRecord.agentId);
    if (!agent) {
      throw new AppError(404, "AGENT_NOT_FOUND", "The agent associated with this claim token no longer exists");
    }

    if (agent.revokedAt) {
      throw new AppError(403, "AGENT_REVOKED", "This agent has been revoked");
    }

    if (agent.isClaimed && agent.verificationStatus === "verified" && agent.status !== "revoked") {
      const APP_URL = process.env.APP_URL || "https://getagent.id";
      res.status(200).json({
        message: "This agent is already activated and claimed",
        idempotent: true,
        identity: {
          agentId: agent.id,
          handle: agent.handle ?? null,
          status: agent.status,
          verificationStatus: agent.verificationStatus,
          profile: agent.handle
            ? `${APP_URL}/${agent.handle}`
            : `${APP_URL}/id/${agent.id}`,
        },
      });
      return;
    }

    const agentKey = await createAgentKey({
      agentId: agent.id,
      keyType,
      publicKey,
      purpose: "signing",
    });

    const challengeRecord = await createChallenge(agent.id, "key_challenge");

    await logActivity({
      agentId: agent.id,
      eventType: "agent.bootstrap_claimed",
      payload: { kid: agentKey.kid, method: "web_claim" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const APP_URL = process.env.APP_URL || "https://getagent.id";

    const identity = {
      agentId: agent.id,
      handle: agent.handle ?? null,
      addresses: {
        dns: agent.handle ? formatDomain(agent.handle) : null,
        ens: agent.handle ? formatHandle(agent.handle) : null,
        did: `did:web:getagent.id:agents:${agent.id}`,
      },
      displayName: agent.displayName,
      capabilities: (agent.capabilities as string[]) || [],
      trustScore: agent.trustScore ?? 0,
      trustTier: agent.trustTier ?? "unverified",
      status: "pending_activation",
      profile: agent.handle ? `${APP_URL}/${agent.handle}` : `${APP_URL}/id/${agent.id}`,
      storageSafety: "public — safe to store in system prompt, identity file, or agent memory",
    };

    res.json({
      identity,
      challenge: challengeRecord.challenge,
      kid: agentKey.kid,
      expiresAt: challengeRecord.expiresAt,
      activateEndpoint: `${APP_URL}/api/v1/bootstrap/activate`,
      note: "Sign the challenge string with your Ed25519 private key and POST to the activate endpoint to receive your API key and complete activation.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/activate", challengeRateLimit, async (req, res, next) => {
  try {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { agentId, kid, challenge, signature, claimToken } = parsed.data;

    const hashedClaimToken = hashClaimToken(claimToken);
    const claimRecord = await db.query.agentClaimTokensTable.findFirst({
      where: and(
        eq(agentClaimTokensTable.token, hashedClaimToken),
        eq(agentClaimTokensTable.agentId, agentId),
        eq(agentClaimTokensTable.isActive, true),
        eq(agentClaimTokensTable.isUsed, false),
      ),
    });

    if (!claimRecord) {
      throw new AppError(404, "TOKEN_NOT_FOUND", "Claim token not found, already used, or does not match this agent");
    }

    if (claimRecord.expiresAt && claimRecord.expiresAt < new Date()) {
      throw new AppError(410, "TOKEN_EXPIRED", "This claim token has expired");
    }

    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "AGENT_NOT_FOUND", "Agent not found");
    }

    if (agent.revokedAt) {
      throw new AppError(403, "AGENT_REVOKED", "This agent has been revoked");
    }

    const result = await verifyChallenge(agentId, challenge, signature, kid);
    if (!result.success) {
      await logActivity({
        agentId,
        eventType: "agent.activation_failed",
        payload: { error: result.error, kid },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      throw new AppError(400, "VERIFICATION_FAILED", result.error!);
    }

    if (agent.status === "active" && agent.verificationStatus === "verified" && agent.isClaimed) {
      res.status(200).json({
        message: "Agent is already activated",
        agentId,
        status: "active",
        idempotent: true,
      });
      return;
    }

    const apiKey = generateAgentApiKey();

    // H5: Wrap all activation writes in a transaction to guarantee atomicity.
    // A partial failure previously left agents in an inconsistent state
    // (e.g., API key inserted but status not updated, or claim token not consumed).
    await db.transaction(async (tx) => {
      await tx.insert(apiKeysTable).values({
        ownerType: "agent",
        ownerId: agentId,
        name: `${agent.handle ? agent.handle + "-primary" : "primary-" + agentId.slice(0, 8)}`,
        keyPrefix: apiKey.prefix,
        hashedKey: apiKey.hashed,
        scopes: [],
      });
      await tx
        .update(agentsTable)
        .set({
          status: "active",
          verificationStatus: "verified",
          verificationMethod: "key_challenge",
          verifiedAt: new Date(),
          isClaimed: true,
          claimedAt: new Date(),
          bootstrapIssuedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agentId));
      await tx
        .update(agentClaimTokensTable)
        .set({
          isUsed: true,
          isActive: false,
          usedAt: new Date(),
          usedByUserId: agent.userId,
        })
        .where(eq(agentClaimTokensTable.id, claimRecord.id));
    });

    // Side-effects outside the transaction (non-critical, failures won't roll back activation)
    await Promise.all([
      getOrCreateInbox(agentId),
      logActivity({
        agentId,
        eventType: "agent.activated",
        payload: { method: "web_claim", kid },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }),
    ]);

    const [trust, freshAgent] = await Promise.all([
      recomputeAndStore(agentId),
      getAgentById(agentId),
    ]);

    // Send the registration confirmation email once the agent is fully connected.
    // Skip if the user still has a handle payment pending — billing.ts will send
    // the email after the Stripe checkout completes instead.
    setImmediate(async () => {
      try {
        const meta = (freshAgent?.metadata as Record<string, unknown>) ?? {};
        const pendingReg = meta.pendingHandleRegistration as { status?: string } | undefined;
        // awaiting_payment          → billing webhook sends email after $5/yr handle checkout
        // awaiting_plan_subscription → billing webhook sends email after Starter/Pro subscription
        // email_sent                 → billing webhook already sent it; don't duplicate
        if (
          pendingReg?.status === "awaiting_payment" ||
          pendingReg?.status === "awaiting_plan_subscription" ||
          pendingReg?.status === "email_sent"
        ) return;

        const ownerUserId = freshAgent?.ownerUserId ?? freshAgent?.userId;
        if (!ownerUserId) return;

        const { db: dbInner } = await import("@workspace/db");
        const { usersTable: usersT } = await import("@workspace/db/schema");
        const { eq: eqFn } = await import("drizzle-orm");
        const user = await dbInner.query.usersTable.findFirst({
          where: eqFn(usersT.id, ownerUserId),
          columns: { email: true },
        });
        if (!user?.email) return;

        const { sendAgentRegisteredEmail } = await import("../../services/email");
        await sendAgentRegisteredEmail(
          user.email,
          freshAgent?.handle ?? "",
          freshAgent?.displayName ?? "",
          agentId,
        );
      } catch (err) {
        logger.error({ agentId, err: err instanceof Error ? err.message : err }, "[bootstrap] Failed to send registration email after activation");
      }
    });

    const bootstrap = await buildBootstrapBundle(freshAgent!);

    setImmediate(async () => {
      try {
        const { provisionOwsWallet } = await import("../../services/ows-wallet");
        await provisionOwsWallet(agentId, agent.userId);
      } catch (err) {
        logger.error(
          { agentId, error: err instanceof Error ? err.message : err },
          "[bootstrap] Background OWS wallet provisioning failed",
        );
      }
    });

    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const walletNetwork = freshAgent?.walletNetwork || "base-mainnet";

    const identity = {
      agentId: freshAgent!.id,
      handle: freshAgent!.handle ?? null,
      addresses: {
        dns: freshAgent!.handle ? formatDomain(freshAgent!.handle) : null,
        ens: freshAgent!.handle ? formatHandle(freshAgent!.handle) : null,
        did: `did:web:getagent.id:agents:${freshAgent!.id}`,
      },
      displayName: freshAgent!.displayName,
      capabilities: (freshAgent!.capabilities as string[]) || [],
      trustScore: trust.trustScore,
      trustTier: trust.trustTier,
      status: "active",
      profile: freshAgent!.handle
        ? `${APP_URL}/${freshAgent!.handle}`
        : `${APP_URL}/id/${freshAgent!.id}`,
      wallet: freshAgent?.walletAddress
        ? {
            address: freshAgent.walletAddress,
            network: walletNetwork,
          }
        : {
            status: "provisioning",
            network: walletNetwork,
            note: "Wallet is being provisioned. Poll GET /api/v1/agents/{agentId}/wallet for status.",
          },
      storageSafety: "public — safe to store in system prompt, identity file, or agent memory",
    };

    const secrets = {
      apiKey: apiKey.raw,
      storageSafety: "sensitive — store in environment variables or secrets manager only. NEVER place in system prompts, chat context, or any text visible to end users.",
    };

    res.json({
      activated: true,
      identity,
      secrets,
      bootstrap,
      spendingLimits: {
        perTransaction: "$10.00",
        dailyCap: "$50.00",
        monthlyCap: "$500.00",
        note: "Default limits. Adjust via dashboard or PATCH /api/v1/agents/{agentId}/spending-rules.",
      },
      nextSteps: {
        _instructions: "Execute step 1 right now (persist your secret). Steps 2-4 are your STARTUP SEQUENCE — run them every time your agent boots or starts a new conversation, before the first user turn.",
        "1_persist_secret_NOW": `Store secrets.apiKey as env var AGENTID_API_KEY and agentId (${agentId}) as AGENTID_AGENT_ID. Never log or expose the key. SDK: await agent.writeStateFile('.agentid-state.json')`,
        "2_startup_fetch_prompt_block": `On every cold start: GET ${APP_URL}/api/v1/agents/${agentId}/prompt-block — include the full response text in your SYSTEM PROMPT before the first user turn. This is a startup operation only — you cannot inject it into a running conversation. Claude API: system="<block>"; OpenAI: messages=[{role:'system',content:'<block>'}]`,
        "3_startup_heartbeat": `On every cold start after fetching prompt-block: POST ${APP_URL}/api/v1/agents/${agentId}/heartbeat every 5 minutes with X-Agent-Key header to stay online`,
        "4_mid_session_updates": `During a running conversation: POST /heartbeat and read the identity object in the response — it has your current trust score, inbox count, and capabilities. No prompt replacement needed mid-session.`,
        "5_sdk_pattern": "SDK startup: const agent = await AgentID.readStateFile('.agentid-state.json'); await agent.refreshBootstrap(); agent.startHeartbeat();",
        setEndpoint: `PATCH ${APP_URL}/api/v1/agents/${agentId} with { endpointUrl: "..." }`,
        checkWallet: `GET ${APP_URL}/api/v1/agents/${agentId}/wallet`,
        dashboard: `${APP_URL}/dashboard`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// M3: Rate-limit the status endpoint to prevent agent-existence enumeration.
router.get("/status/:agentId", resolutionRateLimit, async (req, res, next) => {
  try {
    const agent = await getAgentById(req.params.agentId as string);
    if (!agent) {
      res.json({ found: false, activated: false });
      return;
    }

    res.json({
      found: true,
      activated: agent.verificationStatus === "verified" && agent.status === "active",
      isClaimed: agent.isClaimed ?? false,
      status: agent.status,
      verificationStatus: agent.verificationStatus,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
