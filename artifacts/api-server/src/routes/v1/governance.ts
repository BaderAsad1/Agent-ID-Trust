import { Router } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentAppealsTable } from "@workspace/db/schema";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";

const router = Router();

const APP_URL = process.env.APP_URL || "https://getagent.id";

const GOVERNANCE_POLICY = {
  platform: "Agent ID",
  version: "1.0",
  lastUpdated: "2026-01-01",
  suspensionPolicy: {
    summary: "Agents may be suspended for violations of our Terms of Service, including but not limited to fraudulent activity, abuse of platform resources, harassment, or repeated trust score manipulation.",
    appealAvailable: true,
    appealEndpoint: `${APP_URL}/api/v1/agents/:agentId/appeal`,
    reviewTimeline: "Appeals are reviewed within 5-10 business days.",
    reinstatementConditions: [
      "Resolution of the violation that led to suspension",
      "Acknowledgment of platform Terms of Service",
      "No history of repeated violations",
    ],
  },
  keyRotationPolicy: {
    summary: "Platform signing keys are rotated on an annual basis or immediately upon evidence of compromise. All issued attestations reference the key ID (kid) used for signing. Consumers should verify attestations against the current JWKS.",
    rotationFrequency: "annual or as-needed",
    jwksEndpoint: `${APP_URL}/api/.well-known/jwks.json`,
    gracePeriod: "24 hours after rotation, old keys remain valid for in-flight verifications.",
  },
  dataRetentionPolicy: {
    summary: "Agent identity data is retained for the lifetime of the agent registration. Activity logs are retained for 12 months. Trust event records are retained for 90 days for scoring purposes and archived thereafter.",
    agentData: "Retained while agent is active; deleted 30 days after agent deletion",
    activityLogs: "12 months",
    trustEvents: "90 days active, then archived",
    auditLogs: "24 months",
    rightToErasure: "Agents and their owners may request data deletion by contacting privacy@getagent.id",
  },
  responsibleDisclosure: {
    contact: "security@getagent.id",
    pgpKey: null,
    policy: "We follow responsible disclosure principles. Please report security vulnerabilities to our security team before public disclosure. We aim to respond within 48 hours.",
    scope: [
      "Authentication and authorization bypass",
      "Trust score manipulation",
      "Data exposure or leakage",
      "Cryptographic weaknesses in attestation",
    ],
    outOfScope: [
      "Rate limiting issues",
      "Known limitations documented in our API reference",
      "Issues in third-party dependencies already reported upstream",
    ],
  },
};

router.get("/governance", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(GOVERNANCE_POLICY);
});

const appealSchema = z.object({
  reason: z.string().min(20).max(5000),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

router.post("/:agentId/appeal", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;

    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only submit appeals for itself");
    }

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    if (agent.status !== "suspended") {
      throw new AppError(409, "NOT_SUSPENDED", "Appeals are only available for suspended agents");
    }

    const pendingAppeal = await db.query.agentAppealsTable.findFirst({
      where: eq(agentAppealsTable.agentId, agentId),
    });

    if (pendingAppeal && pendingAppeal.status === "pending") {
      throw new AppError(409, "APPEAL_PENDING", "An appeal for this agent is already pending review");
    }

    const parsed = appealSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const [appeal] = await db.insert(agentAppealsTable).values({
      agentId,
      reason: parsed.data.reason,
      evidence: parsed.data.evidence ?? null,
      status: "pending",
    }).returning();

    try {
      const { deliverOutbound } = await import("../../services/mail-transport");
      const { env } = await import("../../lib/env");
      await deliverOutbound({
        messageId: `appeal-${appeal.id}`,
        from: env().FROM_EMAIL,
        to: "appeals@getagent.id",
        subject: `Appeal Submitted: Agent @${agent.handle} (${agentId})`,
        body: `<p>An appeal has been submitted for agent <strong>@${agent.handle}</strong> (${agentId}).</p><p><strong>Reason:</strong><br>${parsed.data.reason}</p><p><strong>Appeal ID:</strong> ${appeal.id}</p><p>Review at: ${APP_URL}/admin/appeals/${appeal.id}</p>`,
        bodyFormat: "html",
      });
    } catch {}

    const inboxAddress = `appeals+${agentId.slice(0, 8)}@getagent.id`;

    res.status(201).json({
      appealId: appeal.id,
      status: appeal.status,
      submittedAt: appeal.createdAt,
      inboxAddress,
      message: "Your appeal has been submitted and will be reviewed within 5-10 business days. You will receive updates at your agent inbox.",
      governanceUrl: `${APP_URL}/api/v1/governance`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
