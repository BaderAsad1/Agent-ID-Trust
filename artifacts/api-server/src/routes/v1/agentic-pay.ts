import { Router } from "express";
import { z } from "zod/v4";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { logger } from "../../middlewares/request-logger";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import {
  getAgentPaymentOptions,
  setAgentSpendAuthorization,
  processAgentUpgrade,
} from "../../services/agentic-payment";
import { checkHandleAvailability, assignHandleToAgent, getHandleTier } from "../../services/handle";
import { getUserPlan, getPlanLimits } from "../../services/billing";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { agentOwnerWhere } from "../../services/agents";

const router = Router();

const APP_URL = () => process.env.APP_URL || "https://getagent.id";

router.get("/options", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.authenticatedAgent!.id;
    const options = await getAgentPaymentOptions(agentId);
    res.json(options);
  } catch (err) {
    next(err);
  }
});

const upgradeSchema = z.object({
  plan: z.enum(["starter", "pro"]),
  paymentMethod: z.enum(["stripe_preauth", "usdc", "card"]),
  billingInterval: z.enum(["monthly", "yearly"]).default("monthly"),
  usdcTxHash: z.string().optional(),
});

router.post("/upgrade", requireAgentAuth, async (req, res, next) => {
  try {
    const parsed = upgradeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const agentId = req.authenticatedAgent!.id;
    const { plan, paymentMethod, billingInterval, usdcTxHash } = parsed.data;

    const result = await processAgentUpgrade(agentId, plan, paymentMethod, billingInterval, usdcTxHash);

    if (result.success) {
      return res.json({
        success: true,
        plan: result.plan,
        transactionId: result.transactionId,
        message: `Successfully upgraded to ${plan} plan`,
      });
    }

    if (result.checkoutUrl) {
      return res.status(402).json({
        success: false,
        checkoutUrl: result.checkoutUrl,
        message: "Redirect to Stripe checkout to complete payment",
      });
    }

    throw new AppError(402, "PAYMENT_REQUIRED", result.error ?? "Payment failed", {
      upgradeUrl: `${APP_URL()}/pricing`,
      paymentOptions: `${APP_URL()}/api/v1/pay/options`,
    });
  } catch (err) {
    return next(err);
  }
});

const authorizeSchema = z.object({
  agentId: z.string().uuid(),
  spendLimitCents: z.number().int().min(0).max(100000),
  paymentMethod: z.enum(["stripe_preauth", "card"]).optional(),
  stripePaymentMethodId: z.string().optional(),
});

router.post("/authorize", requireAuth, async (req, res, next) => {
  try {
    const parsed = authorizeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { agentId, spendLimitCents, paymentMethod, stripePaymentMethodId } = parsed.data;

    const agent = await db.query.agentsTable.findFirst({
      where: agentOwnerWhere(agentId, req.userId!),
      columns: { id: true },
    });

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found or you do not own it");
    }

    await setAgentSpendAuthorization(
      agentId,
      req.userId!,
      spendLimitCents,
      paymentMethod,
      stripePaymentMethodId,
    );

    res.json({
      success: true,
      agentId,
      spendLimitCents,
      spendLimitDollars: spendLimitCents / 100,
      paymentMethod: paymentMethod ?? "card",
      message: `Agent authorized to spend up to $${(spendLimitCents / 100).toFixed(2)}`,
    });
  } catch (err) {
    next(err);
  }
});

const handleClaimSchema = z.object({
  handle: z.string().min(5).max(32),
  agentId: z.string().uuid(),
});

router.post("/handle/claim", requireAgentAuth, async (req, res, next) => {
  try {
    const parsed = handleClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { handle, agentId } = parsed.data;
    const claimingAgent = req.authenticatedAgent!;

    if (claimingAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only claim handles for your own agent");
    }

    const normalized = handle.toLowerCase();
    const tierInfo = getHandleTier(normalized);

    if (tierInfo.tier === "reserved_1_2") {
      throw new AppError(400, "HANDLE_RESERVED", "Handles of 1-2 characters are reserved");
    }

    if (tierInfo.tier === "premium_3" || tierInfo.tier === "premium_4") {
      throw new AppError(402, "PAYMENT_REQUIRED", `${tierInfo.tier === "premium_3" ? "3" : "4"}-character handles require payment`, {
        tier: tierInfo.tier,
        annualCents: tierInfo.annualCents,
        annualUsd: tierInfo.annualUsd,
        checkoutUrl: `${APP_URL()}/api/v1/billing/handle-checkout`,
        upgradeUrl: `${APP_URL()}/pricing`,
        paymentOptions: `${APP_URL()}/api/v1/pay/options`,
      });
    }

    const availability = await checkHandleAvailability(normalized);
    if (!availability.available) {
      throw new AppError(409, "HANDLE_TAKEN", availability.reason ?? "This handle is not available");
    }

    const userPlan = await getUserPlan(claimingAgent.userId);
    const limits = getPlanLimits(userPlan);

    if (!limits.includesStandardHandle) {
      throw new AppError(403, "PLAN_REQUIRED", "A Starter or Pro plan is required to claim a standard handle via the automatic benefit — 5+ char handles are included automatically with Starter and Pro. Enterprise handles are provisioned via custom/sales-led agreement.", {
        upgradeUrl: `${APP_URL()}/pricing`,
        paymentOptions: `${APP_URL()}/api/v1/pay/options`,
        plans: [
          { id: "starter", name: "Starter", monthlyUsd: 29, note: "1 standard handle (5+ chars) included automatically with active subscription" },
          { id: "pro", name: "Pro", monthlyUsd: 79, note: "1 standard handle (5+ chars) included automatically with active subscription" },
        ],
      });
    }

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await assignHandleToAgent(agentId, normalized, {
      tier: tierInfo.tier,
      paid: true,
      expiresAt,
    });

    res.json({
      success: true,
      handle: normalized,
      tier: tierInfo.tier,
      annualUsd: tierInfo.annualUsd,
      expiresAt,
      message: `Handle @${normalized} successfully claimed. Renew annually to keep it.`,
      renewUrl: `${APP_URL()}/api/v1/programmatic/agents/${agentId}/handle/renew`,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/execute-upgrade", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = req.authenticatedAgent!;

    if (!agent.walletAddress) {
      return res.status(400).json({
        error: "NO_WALLET",
        message: "Agent has no wallet configured. Register a wallet first.",
        docs: `${APP_URL()}/docs/wallet`,
      });
    }

    if (agent.walletIsSelfCustodial) {
      return res.status(400).json({
        error: "SELF_CUSTODIAL_WALLET",
        message: "Self-custodial wallets cannot sign x402 payments server-side. Use the x402 client SDK directly.",
        sdkDocs: `${APP_URL()}/docs/x402-client`,
      });
    }

    const accountName = `aid-${agent.id.replace(/-/g, "").substring(0, 28)}`;
    const { plan = "starter", billingInterval = "monthly" } = req.body;

    if (!["starter", "pro"].includes(plan)) {
      return res.status(400).json({
        error: "INVALID_PLAN",
        message: "Plan must be 'starter' or 'pro'",
      });
    }

    const { executeX402Payment } = await import("../../services/x402-client");

    const agentKey = req.headers["x-agent-key"] as string | undefined;

    const APP = APP_URL();
    const result = await executeX402Payment({
      agentId: agent.id,
      agentAccountName: accountName,
      targetUrl: `${APP}/api/v1/pay/upgrade/x402`,
      method: "POST",
      body: { plan, billingInterval },
      agentKey,
    });

    if (!result.success) {
      return res.status(402).json({
        error: "PAYMENT_FAILED",
        message: result.error,
        hint: "Check wallet balance and spending rules",
      });
    }

    return res.json({
      upgraded: true,
      plan,
      txHash: result.txHash,
      agentId: agent.id,
      message: `Plan upgraded to ${plan} via x402 autonomous payment`,
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/upgrade/x402", requireAgentAuth, async (req, res, next) => {
  try {
    const { verifyAndSettleX402Payment } = await import("../../middlewares/x402");
    const { getPlatformTreasuryAddress, IS_TESTNET } = await import("../../lib/cdp");
    const agentId = req.authenticatedAgent!.id;
    const plan = req.body?.plan || "starter";

    const planPrices: Record<string, string> = IS_TESTNET
      ? { starter: "1.00", pro: "1.00" }
      : { starter: "29.00", pro: "79.00" };
    const amountUsdc = planPrices[plan] || (IS_TESTNET ? "1.00" : "29.00");

    const treasuryAddress = getPlatformTreasuryAddress();
    if (!treasuryAddress) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Platform treasury wallet not configured. x402 upgrades are currently unavailable.");
    }

    const paymentHeader = (req.headers["payment-signature"] as string | undefined)
      || (req.headers["x-payment"] as string | undefined);

    const x402PaymentType = "plan_upgrade";

    if (!paymentHeader) {
      const { x402PaymentRequired: factory } = await import("../../middlewares/x402");
      req.authenticatedAgent = { ...req.authenticatedAgent!, walletAddress: treasuryAddress };
      const middleware = factory(amountUsdc, `Upgrade to ${plan} plan via x402`, x402PaymentType, plan);
      return middleware(req, res, next);
    }

    const result = await verifyAndSettleX402Payment(
      agentId,
      paymentHeader,
      amountUsdc,
      x402PaymentType,
      plan,
      treasuryAddress,
    );

    if (!result.success) {
      throw new AppError(402, "PAYMENT_FAILED", result.error || "Payment verification failed");
    }

    const { activatePlanForAgent, activatePlanForUser } = await import("../../services/billing");
    const agentRecord = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { userId: true },
    });
    if (!agentRecord) {
      throw new AppError(500, "ACTIVATION_FAILED", "Agent not found after payment — contact support", {
        paymentId: result.paymentId,
        txHash: result.txHash,
      });
    }

    try {
      await activatePlanForAgent(agentId, plan as "starter" | "pro", "monthly");
      await activatePlanForUser(agentRecord.userId, plan as "starter" | "pro", undefined, "monthly");
    } catch (activationErr) {
      const msg = activationErr instanceof Error ? activationErr.message : String(activationErr);
      logger.error({ err: activationErr, agentId, plan }, "[x402] Plan activation failed after settlement");
      throw new AppError(500, "ACTIVATION_FAILED", `Payment settled but plan activation failed: ${msg}. Contact support with your payment ID.`, {
        paymentId: result.paymentId,
        txHash: result.txHash,
        status: "settled_unapplied",
      });
    }

    res.json({
      success: true,
      plan,
      paymentId: result.paymentId,
      txHash: result.txHash,
      message: `Successfully upgraded to ${plan} plan via x402 payment`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/x402-info", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.authenticatedAgent!.id;
    const { getAgentWallet } = await import("../../services/wallet");
    const { NETWORK_ID: networkId, USDC_CONTRACT_ADDRESS: usdcAddr, BASE_EXPLORER_URL: explorerUrl } = await import("../../lib/cdp");

    const wallet = await getAgentWallet(agentId);
    const APP_URL = process.env.APP_URL || "https://getagent.id";

    res.json({
      walletAddress: wallet?.address || null,
      network: wallet?.network || networkId,
      usdcBalance: wallet?.usdcBalance || null,
      basescanUrl: wallet?.basescanUrl || null,
      x402Endpoints: {
        upgradeViax402: `${APP_URL}/api/v1/pay/upgrade/x402`,
        info: `${APP_URL}/api/v1/pay/x402-info`,
      },
      usdcContract: usdcAddr,
      explorerUrl,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
