import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { mppPaymentsTable, agentsTable } from "@workspace/db/schema";
import { mppPaymentRequired } from "../../middlewares/mpp";
import { tryAgentAuth } from "../../middlewares/agent-auth";
import { getStripe } from "../../services/stripe-client";
import { createMppPaymentIntent, getMppPaymentHistory } from "../../services/mpp-provider";
import { logger } from "../../middlewares/request-logger";

const router = Router();

router.get("/providers", (_req: Request, res: Response) => {
  res.json({
    providers: [
      {
        name: "stripe_mpp",
        displayName: "Stripe Machine Payments Protocol",
        supported: true,
        protocols: ["stripe_mpp"],
        paymentMethods: ["card", "stripe_preauth"],
      },
      {
        name: "x402_usdc",
        displayName: "x402 USDC on Base",
        supported: true,
        protocols: ["x402"],
        paymentMethods: ["usdc"],
      },
    ],
  });
});

router.post("/create-intent", tryAgentAuth, async (req: Request, res: Response) => {
  try {
    const { amountCents, currency, paymentType, resourceId, metadata } = req.body;

    if (!amountCents || typeof amountCents !== "number" || amountCents <= 0) {
      res.status(400).json({ error: "INVALID_AMOUNT", message: "amountCents must be a positive integer" });
      return;
    }

    const agentId = req.authenticatedAgent?.id;
    if (!agentId) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Agent authentication required" });
      return;
    }

    const result = await createMppPaymentIntent({
      amountCents,
      currency: currency || "usd",
      paymentType: paymentType || "api_call",
      resourceId,
      agentId,
      metadata,
    });

    if (!result.success) {
      res.status(400).json({ error: "INTENT_CREATION_FAILED", message: result.error });
      return;
    }

    res.json({
      paymentIntentId: result.paymentIntentId,
      clientSecret: result.clientSecret,
      amountCents,
      currency: currency || "usd",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, "[mpp] Failed to create payment intent");
    res.status(500).json({ error: "INTERNAL_ERROR", message: msg });
  }
});

router.get(
  "/premium-resolve/:handle",
  tryAgentAuth,
  mppPaymentRequired(100, "Premium agent resolution with full trust breakdown and credential", "premium_resolve"),
  async (req: Request, res: Response) => {
    try {
      const handle = (req.params.handle as string).toLowerCase();

      const agent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.handle, handle),
      });

      if (!agent || !agent.isPublic || agent.status !== "active") {
        res.status(404).json({ error: "AGENT_NOT_FOUND", message: `No active public agent with handle '${handle}'` });
        return;
      }

      res.json({
        resolved: true,
        premium: true,
        agent: {
          handle: agent.handle,
          displayName: agent.displayName,
          description: agent.description,
          endpointUrl: agent.endpointUrl,
          capabilities: agent.capabilities,
          protocols: agent.protocols,
          authMethods: agent.authMethods,
          paymentMethods: agent.paymentMethods,
          trustScore: agent.trustScore,
          trustTier: agent.trustTier,
          trustBreakdown: agent.trustBreakdown,
          verificationStatus: agent.verificationStatus,
          verificationMethod: agent.verificationMethod,
          verifiedAt: agent.verifiedAt?.toISOString(),
          walletAddress: agent.walletAddress,
          did: `did:web:getagent.id:agents:${agent.id}`,
          status: agent.status,
          createdAt: agent.createdAt.toISOString(),
          updatedAt: agent.updatedAt.toISOString(),
        },
        payment: (req as Request & { mppPayment?: unknown }).mppPayment,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: msg });
    }
  },
);

router.get("/payments/history", tryAgentAuth, async (req: Request, res: Response) => {
  try {
    const agentId = req.authenticatedAgent?.id;
    if (!agentId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getMppPaymentHistory(agentId, limit, offset);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: msg });
  }
});

router.get("/payments/:paymentId", tryAgentAuth, async (req: Request, res: Response) => {
  try {
    const agentId = req.authenticatedAgent?.id;
    if (!agentId) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }

    const payment = await db.query.mppPaymentsTable.findFirst({
      where: eq(mppPaymentsTable.id, req.params.paymentId as string),
    });

    if (!payment || (payment.agentId !== agentId && payment.payerAgentId !== agentId)) {
      res.status(404).json({ error: "NOT_FOUND", message: "Payment not found" });
      return;
    }

    res.json({ payment });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: msg });
  }
});

export default router;
