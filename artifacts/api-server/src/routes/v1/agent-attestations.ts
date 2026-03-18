import { Router } from "express";
import { z } from "zod/v4";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentAttestationsTable,
  agentsTable,
  agentKeysTable,
} from "@workspace/db/schema";
import { requireAgentAuth, requireScope } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import { getAgentByHandle } from "../../services/agents";
import { recomputeAndStore } from "../../services/trust-score";
import { logActivity } from "../../services/activity-logger";
import { logSignedActivity } from "../../services/activity-log";
import { deliverWebhookEvent } from "../../services/webhook-delivery";
import { logger } from "../../middlewares/request-logger";

const router = Router();

const attestSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  category: z.string().max(100).optional(),
  content: z.string().max(2000).optional(),
  signature: z.string().min(1),
});

router.post("/:agentId/attest/:subjectHandle", requireAgentAuth, requireScope("agents:attest"), validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const subjectHandle = req.params.subjectHandle as string;

    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only attest using its own identity");
    }

    const parsed = attestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const subjectAgent = await getAgentByHandle(subjectHandle);
    if (!subjectAgent || subjectAgent.status !== "active") {
      throw new AppError(404, "NOT_FOUND", "Subject agent not found");
    }

    if (subjectAgent.id === agentId) {
      throw new AppError(400, "SELF_ATTESTATION", "Cannot attest yourself");
    }

    const attesterKeys = await db.query.agentKeysTable.findMany({
      where: and(
        eq(agentKeysTable.agentId, agentId),
        eq(agentKeysTable.status, "active"),
        eq(agentKeysTable.keyType, "ed25519"),
      ),
    });

    if (attesterKeys.length === 0) {
      throw new AppError(400, "NO_SIGNING_KEY", "Attester must have an active Ed25519 key");
    }

    const canonicalPayload = JSON.stringify({
      attesterId: agentId,
      subjectHandle,
      sentiment: parsed.data.sentiment,
      category: parsed.data.category || null,
      content: parsed.data.content || null,
    });

    let signatureValid = false;
    const crypto = await import("crypto");
    for (const key of attesterKeys) {
      if (!key.publicKey) continue;
      try {
        const publicKeyObj = crypto.createPublicKey({
          key: Buffer.from(key.publicKey, "base64"),
          format: "der",
          type: "spki",
        });
        // H2: Cryptographic enforcement — reject non-Ed25519 key material regardless of stored label
        if (publicKeyObj.asymmetricKeyType !== "ed25519") {
          logger.warn({ kid: key.kid, actualKeyType: publicKeyObj.asymmetricKeyType }, "[attestations] H2: skipping non-ed25519 key material");
          continue;
        }
        signatureValid = crypto.verify(
          null,
          Buffer.from(canonicalPayload),
          publicKeyObj,
          Buffer.from(parsed.data.signature, "base64"),
        );
        if (signatureValid) break;
      } catch (err) {
        logger.warn({ err, kid: key.kid }, "[attestations] Signature verification failed for key");
      }
    }

    if (!signatureValid) {
      throw new AppError(400, "INVALID_SIGNATURE", "Ed25519 signature verification failed against all active keys");
    }

    const existingAttestation = await db.query.agentAttestationsTable.findFirst({
      where: and(
        eq(agentAttestationsTable.attesterId, agentId),
        eq(agentAttestationsTable.subjectId, subjectAgent.id),
        isNull(agentAttestationsTable.revokedAt),
      ),
    });

    if (existingAttestation) {
      throw new AppError(409, "ATTESTATION_EXISTS", "An active attestation already exists for this subject from this attester. Revoke the existing one before submitting a new attestation.", {
        existingAttestationId: existingAttestation.id,
        existingCreatedAt: existingAttestation.createdAt,
      });
    }

    const attester = req.authenticatedAgent!;
    const weight = Math.max(0.1, attester.trustScore / 100);

    const [attestation] = await db
      .insert(agentAttestationsTable)
      .values({
        attesterId: agentId,
        subjectId: subjectAgent.id,
        sentiment: parsed.data.sentiment,
        category: parsed.data.category,
        content: parsed.data.content,
        signature: parsed.data.signature,
        attesterTrustScore: attester.trustScore,
        weight,
      })
      .returning();

    await logActivity({
      agentId: subjectAgent.id,
      eventType: "agent.trust_updated",
      payload: {
        attestationId: attestation.id,
        attesterId: agentId,
        sentiment: parsed.data.sentiment,
        category: parsed.data.category,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    try {
      await logSignedActivity({
        agentId: subjectAgent.id,
        eventType: "agent.attestation_received",
        payload: {
          attestationId: attestation.id,
          attesterId: agentId,
          sentiment: parsed.data.sentiment,
        },
        isPublic: true,
      });
    } catch (err) {
      logger.error({ err }, "[attestations] Failed to log signed activity");
    }

    try {
      await recomputeAndStore(subjectAgent.id);
    } catch (err) {
      logger.error({ err }, "[attestations] Failed to recompute trust");
    }

    try {
      await deliverWebhookEvent(subjectAgent.id, "attestation.received", {
        attestationId: attestation.id,
        attesterId: agentId,
        sentiment: parsed.data.sentiment,
      });
    } catch (err) {
      logger.error({ err }, "[attestations] Failed to deliver webhook");
    }

    res.status(201).json(attestation);
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/trust-attestation", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;

    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only request attestations for itself");
    }

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    const { computeTrustScore } = await import("../../services/trust-score");
    const { getVcSigner } = await import("../../services/vc-signer");
    const jose = await import("jose");

    const trust = await computeTrustScore(agentId);
    const signer = await getVcSigner();

    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 24 * 60 * 60;

    const attestationPayload = {
      sub: `did:agentid:${agent.handle}`,
      agentId: agent.id,
      handle: agent.handle,
      trustScore: trust.trustScore,
      trustTier: trust.trustTier,
      verificationStatus: agent.verificationStatus,
      iss: APP_URL,
      aud: "trust-attestation",
    };

    const jwt = await signer.sign(
      new jose.SignJWT(attestationPayload)
        .setProtectedHeader({ alg: "EdDSA", kid: signer.kid, typ: "JWT" })
        .setIssuer(APP_URL)
        .setSubject(`did:agentid:${agent.handle}`)
        .setIssuedAt(now)
        .setExpirationTime(expiresAt),
    );

    res.json({
      attestation: jwt,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      trustScore: trust.trustScore,
      trustTier: trust.trustTier,
      verificationStatus: agent.verificationStatus,
      jwksUrl: `${APP_URL}/api/.well-known/jwks.json`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
