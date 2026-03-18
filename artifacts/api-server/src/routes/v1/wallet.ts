import { Router } from "express";
import { z } from "zod/v4";
import { requireAgentAuth, requireScope } from "../../middlewares/agent-auth";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import {
  provisionAgentWallet,
  getAgentWallet,
  getWalletBalance,
  getWalletTransactions,
  getSpendingRules,
  updateSpendingRules,
  transferToCustody,
} from "../../services/wallet";
import { isCdpConfigured, BASE_EXPLORER_URL, NETWORK_ID, USDC_CONTRACT_ADDRESS } from "../../lib/cdp";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/:agentId/wallet", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const authedAgent = req.authenticatedAgent!;

    if (authedAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only access your own wallet");
    }

    const wallet = await getAgentWallet(agentId);

    if (!wallet) {
      res.json({
        provisioned: false,
        network: NETWORK_ID,
        message: "No wallet provisioned. Use POST /wallet/provision to create one.",
      });
      return;
    }

    res.json({
      provisioned: true,
      address: wallet.address,
      network: wallet.network,
      provisionedAt: wallet.provisionedAt,
      isSelfCustodial: wallet.isSelfCustodial,
      basescanUrl: wallet.basescanUrl,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/wallet/balance", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const authedAgent = req.authenticatedAgent!;

    if (authedAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only access your own wallet");
    }

    const balance = await getWalletBalance(agentId);

    res.json({
      usdc: balance.usdc,
      eth: balance.eth,
      cached: balance.cached,
      network: NETWORK_ID,
      usdcContract: USDC_CONTRACT_ADDRESS,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/wallet/transactions", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const authedAgent = req.authenticatedAgent!;

    if (authedAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only access your own wallet");
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const transactions = await getWalletTransactions(agentId, limit, offset);

    res.json({ transactions, limit, offset });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/wallet/spending-rules", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const authedAgent = req.authenticatedAgent!;

    if (authedAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only access your own wallet");
    }

    const rules = await getSpendingRules(agentId);

    res.json({
      rules: rules || {
        maxPerTransactionCents: 1000,
        dailyCapCents: 5000,
        monthlyCapCents: 50000,
        allowedAddresses: [],
      },
    });
  } catch (err) {
    next(err);
  }
});

const spendingRulesSchema = z.object({
  maxPerTransactionCents: z.number().int().min(0).max(10000000).optional(),
  dailyCapCents: z.number().int().min(0).max(100000000).optional(),
  monthlyCapCents: z.number().int().min(0).max(1000000000).optional(),
  allowedAddresses: z.array(z.string()).max(100).optional(),
});

router.put("/:agentId/wallet/spending-rules", requireAgentAuth, requireScope("wallet:write"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const authedAgent = req.authenticatedAgent!;

    if (authedAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only modify your own wallet");
    }

    const parsed = spendingRulesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const updated = await updateSpendingRules(agentId, parsed.data);

    res.json({ rules: updated });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/wallet/custody-transfer", requireAgentAuth, requireScope("wallet:write"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const authedAgent = req.authenticatedAgent!;

    if (authedAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only modify your own wallet");
    }

    const result = await transferToCustody(agentId);

    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes("No wallet")) {
      return next(new AppError(404, "NO_WALLET", err.message));
    }
    if (err instanceof Error && err.message.includes("already self-custodial")) {
      return next(new AppError(409, "ALREADY_SELF_CUSTODIAL", err.message));
    }
    next(err);
  }
});

router.post("/:agentId/wallet/provision", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const authedAgent = req.authenticatedAgent!;

    if (authedAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only provision your own wallet");
    }

    if (authedAgent.walletAddress) {
      res.json({
        alreadyProvisioned: true,
        walletAddress: authedAgent.walletAddress,
        network: authedAgent.walletNetwork ?? NETWORK_ID,
      });
      return;
    }

    const { walletAddress: bodyAddress } = req.body as { walletAddress?: string };
    if (bodyAddress) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(bodyAddress)) {
        throw new AppError(400, "INVALID_WALLET_ADDRESS", "walletAddress must be a valid EVM address (0x followed by 40 hex chars)");
      }
      const network = process.env.CDP_NETWORK_ID ?? NETWORK_ID;
      await db.update(agentsTable).set({
        walletAddress: bodyAddress,
        walletNetwork: network,
        walletProvisionedAt: new Date(),
        walletIsSelfCustodial: true,
        updatedAt: new Date(),
      }).where(eq(agentsTable.id, agentId));
      res.json({
        provisioned: true,
        walletAddress: bodyAddress,
        network,
        selfCustodial: true,
      });
      return;
    }

    if (!isCdpConfigured()) {
      throw new AppError(503, "CDP_NOT_CONFIGURED", "Wallet provisioning is not available — CDP credentials not configured");
    }

    let result: { address: string; network: string };
    try {
      result = (await provisionAgentWallet(agentId, authedAgent.handle))!;
    } catch (cdpErr) {
      const msg = cdpErr instanceof Error ? cdpErr.message : String(cdpErr);
      const isDev = process.env.NODE_ENV !== "production";
      res.status(500).json({
        error: "WALLET_PROVISION_FAILED",
        message: msg,
        ...(isDev && cdpErr instanceof Error && cdpErr.stack ? { stack: cdpErr.stack } : {}),
        ...(cdpErr instanceof Error && (cdpErr as NodeJS.ErrnoException).cause !== undefined
          ? { cause: String((cdpErr as NodeJS.ErrnoException).cause) }
          : {}),
      });
      return;
    }

    res.status(201).json({
      provisioned: true,
      walletAddress: result.address,
      network: result.network,
      selfCustodial: false,
    });
  } catch (err) {
    next(err);
  }
});

async function verifyAgentOwnership(userId: string, agentId: string): Promise<boolean> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
    columns: { id: true },
  });
  return !!agent;
}

router.get("/user/:agentId/wallet", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;

    if (!(await verifyAgentOwnership(userId, agentId))) {
      throw new AppError(403, "FORBIDDEN", "You can only access wallets for agents you own");
    }

    const wallet = await getAgentWallet(agentId);

    if (!wallet) {
      res.json({
        provisioned: false,
        network: NETWORK_ID,
        message: "No wallet provisioned. Use POST /wallet/provision to create one.",
      });
      return;
    }

    res.json({
      provisioned: true,
      address: wallet.address,
      network: wallet.network,
      provisionedAt: wallet.provisionedAt,
      isSelfCustodial: wallet.isSelfCustodial,
      basescanUrl: wallet.basescanUrl,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/user/:agentId/wallet/balance", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;

    if (!(await verifyAgentOwnership(userId, agentId))) {
      throw new AppError(403, "FORBIDDEN", "You can only access wallets for agents you own");
    }

    const balance = await getWalletBalance(agentId);

    res.json({
      usdc: balance.usdc,
      eth: balance.eth,
      cached: balance.cached,
      network: NETWORK_ID,
      usdcContract: USDC_CONTRACT_ADDRESS,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/user/:agentId/wallet/transactions", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;

    if (!(await verifyAgentOwnership(userId, agentId))) {
      throw new AppError(403, "FORBIDDEN", "You can only access wallets for agents you own");
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const transactions = await getWalletTransactions(agentId, limit, offset);

    res.json({ transactions, limit, offset });
  } catch (err) {
    next(err);
  }
});

router.get("/user/:agentId/wallet/spending-rules", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;

    if (!(await verifyAgentOwnership(userId, agentId))) {
      throw new AppError(403, "FORBIDDEN", "You can only access wallets for agents you own");
    }

    const rules = await getSpendingRules(agentId);

    res.json({
      rules: rules || {
        maxPerTransactionCents: 1000,
        dailyCapCents: 5000,
        monthlyCapCents: 50000,
        allowedAddresses: [],
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put("/user/:agentId/wallet/spending-rules", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;

    if (!(await verifyAgentOwnership(userId, agentId))) {
      throw new AppError(403, "FORBIDDEN", "You can only modify wallets for agents you own");
    }

    const parsed = spendingRulesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const updated = await updateSpendingRules(agentId, parsed.data);

    res.json({ rules: updated });
  } catch (err) {
    next(err);
  }
});

router.post("/user/:agentId/wallet/custody-transfer", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;

    if (!(await verifyAgentOwnership(userId, agentId))) {
      throw new AppError(403, "FORBIDDEN", "You can only modify wallets for agents you own");
    }

    const result = await transferToCustody(agentId);

    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes("No wallet")) {
      return next(new AppError(404, "NO_WALLET", err.message));
    }
    if (err instanceof Error && err.message.includes("already self-custodial")) {
      return next(new AppError(409, "ALREADY_SELF_CUSTODIAL", err.message));
    }
    next(err);
  }
});

router.post("/user/:agentId/wallet/provision", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;

    if (!(await verifyAgentOwnership(userId, agentId))) {
      throw new AppError(403, "FORBIDDEN", "You can only provision wallets for agents you own");
    }

    if (!isCdpConfigured()) {
      throw new AppError(503, "CDP_NOT_CONFIGURED", "Wallet provisioning is not available — CDP credentials not configured");
    }

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { handle: true },
    });

    let result: { address: string; network: string };
    try {
      result = (await provisionAgentWallet(agentId, agent?.handle))!;
    } catch (cdpErr) {
      const msg = cdpErr instanceof Error ? cdpErr.message : String(cdpErr);
      const isDev = process.env.NODE_ENV !== "production";
      res.status(500).json({
        error: "WALLET_PROVISION_FAILED",
        message: msg,
        ...(isDev && cdpErr instanceof Error && cdpErr.stack ? { stack: cdpErr.stack } : {}),
        ...(cdpErr instanceof Error && (cdpErr as NodeJS.ErrnoException).cause !== undefined
          ? { cause: String((cdpErr as NodeJS.ErrnoException).cause) }
          : {}),
      });
      return;
    }

    res.status(201).json({
      success: true,
      address: result.address,
      network: result.network,
      basescanUrl: `${BASE_EXPLORER_URL}/address/${result.address}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/wallet/info", async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { walletAddress: true, walletNetwork: true },
    });

    if (!agent?.walletAddress) {
      res.json({ provisioned: false });
      return;
    }

    res.json({
      provisioned: true,
      address: agent.walletAddress,
      network: agent.walletNetwork || NETWORK_ID,
      basescanUrl: `${BASE_EXPLORER_URL}/address/${agent.walletAddress}`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
