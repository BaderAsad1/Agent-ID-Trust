import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentFeedbackTable } from "@workspace/db/schema";
import { AppError } from "../../middlewares/error-handler";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { logger } from "../../middlewares/request-logger";
import { env } from "../../lib/env";

const router = Router();

router.post("/:handle/feedback", requireAgentAuth, async (req, res, next) => {
  try {
    const handle = (req.params.handle as string).toLowerCase();

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.handle, handle),
      columns: {
        id: true,
        handle: true,
        status: true,
        isPublic: true,
      },
    });

    if (!agent || agent.status !== "active") {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    const body = req.body as Record<string, unknown>;
    const { value, valueDecimals, tag1, endpoint, chain } = body;

    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
      throw new AppError(400, "INVALID_VALUE", "value must be an integer between 0 and 100");
    }
    if (!chain || typeof chain !== "string" || chain.trim().length === 0) {
      throw new AppError(400, "INVALID_CHAIN", "chain is required and must be a non-empty string");
    }
    if (valueDecimals !== undefined && (typeof valueDecimals !== "number" || !Number.isInteger(valueDecimals) || valueDecimals < 0)) {
      throw new AppError(400, "INVALID_VALUE_DECIMALS", "valueDecimals must be a non-negative integer");
    }
    if (tag1 !== undefined && tag1 !== null && typeof tag1 !== "string") {
      throw new AppError(400, "INVALID_TAG1", "tag1 must be a string");
    }
    if (endpoint !== undefined && endpoint !== null && typeof endpoint !== "string") {
      throw new AppError(400, "INVALID_ENDPOINT", "endpoint must be a string");
    }
    if (endpoint && typeof endpoint === "string") {
      try {
        new URL(endpoint);
      } catch {
        throw new AppError(400, "INVALID_ENDPOINT", "endpoint must be a valid URL");
      }
    }

    const submittingAgent = req.authenticatedAgent!;

    const feedbackRow = await db.insert(agentFeedbackTable).values({
      subjectAgentId: agent.id,
      submitterAgentId: submittingAgent.id,
      value: value as number,
      valueDecimals: typeof valueDecimals === "number" ? (valueDecimals as number) : 0,
      tag1: tag1 as string ?? null,
      chain: (chain as string).trim(),
      onchainStatus: "pending",
      metadata: {
        endpoint: endpoint ?? null,
        handle,
      },
    }).returning({ id: agentFeedbackTable.id });

    const feedbackId = feedbackRow[0]?.id;

    const onchainEnabled =
      env().ONCHAIN_MINTING_ENABLED === "true" || env().ONCHAIN_MINTING_ENABLED === "1";

    let txHash: string | undefined;

    if (onchainEnabled) {
      const registrarAddress = process.env.BASE_AGENTID_REGISTRAR;
      const rpcUrl = process.env.BASE_RPC_URL;

      if (registrarAddress && rpcUrl && (chain as string).trim().toLowerCase() === "base") {
        logger.info(
          { agentId: agent.id, chain, value, registrar: registrarAddress },
          "[feedback] On-chain reputation submission enabled — submitting to ERC-8004 registry",
        );

        try {
          const { createWalletClient, createPublicClient, http, parseAbi } = await import("viem");
          const { base } = await import("viem/chains");
          const { privateKeyToAccount } = await import("viem/accounts");

          const minterKey = process.env.BASE_MINTER_PRIVATE_KEY;
          if (!minterKey) {
            throw new Error("BASE_MINTER_PRIVATE_KEY not configured");
          }

          const REPUTATION_REGISTRY_ABI = parseAbi([
            "function submitFeedback(address subject, uint256 value, uint8 valueDecimals, string calldata tag1, string calldata chain) external returns (bytes32 feedbackId)",
          ]);

          const agentRecord = await db.query.agentsTable.findFirst({
            where: eq(agentsTable.id, agent.id),
            columns: { walletAddress: true, erc8004AgentId: true },
          });

          const subjectAddress = agentRecord?.walletAddress ?? agent.id;

          const account = privateKeyToAccount(minterKey as `0x${string}`);
          const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
          const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });

          const hash = await walletClient.writeContract({
            address: registrarAddress as `0x${string}`,
            abi: REPUTATION_REGISTRY_ABI,
            functionName: "submitFeedback",
            args: [
              subjectAddress as `0x${string}`,
              BigInt(value as number),
              typeof valueDecimals === "number" ? valueDecimals as number : 0,
              tag1 as string ?? "",
              (chain as string).trim(),
            ],
          });

          const receipt = await publicClient.waitForTransactionReceipt({ hash });

          if (receipt.status === "success") {
            txHash = hash;
            logger.info({ agentId: agent.id, txHash: hash }, "[feedback] Feedback submitted on-chain");

            if (feedbackId) {
              await db.update(agentFeedbackTable)
                .set({ onchainTxHash: hash, onchainStatus: "confirmed" })
                .where(eq(agentFeedbackTable.id, feedbackId));
            }
          } else {
            logger.warn({ agentId: agent.id, txHash: hash }, "[feedback] On-chain feedback tx reverted");
            if (feedbackId) {
              await db.update(agentFeedbackTable)
                .set({ onchainStatus: "failed", errorMessage: `tx reverted: ${hash}` })
                .where(eq(agentFeedbackTable.id, feedbackId));
            }
          }
        } catch (onchainErr) {
          const errMsg = onchainErr instanceof Error ? onchainErr.message : String(onchainErr);
          logger.error({ agentId: agent.id, error: errMsg }, "[feedback] On-chain feedback submission failed");
          if (feedbackId) {
            await db.update(agentFeedbackTable)
              .set({ onchainStatus: "failed", errorMessage: errMsg })
              .where(eq(agentFeedbackTable.id, feedbackId));
          }
        }
      } else {
        logger.info(
          { agentId: agent.id, chain, registrarConfigured: !!registrarAddress, rpcConfigured: !!rpcUrl },
          "[feedback] On-chain submission skipped — registrar not configured or non-Base chain",
        );
        if (feedbackId) {
          await db.update(agentFeedbackTable)
            .set({ onchainStatus: "skipped" })
            .where(eq(agentFeedbackTable.id, feedbackId));
        }
      }
    } else {
      if (feedbackId) {
        await db.update(agentFeedbackTable)
          .set({ onchainStatus: "disabled" })
          .where(eq(agentFeedbackTable.id, feedbackId));
      }
    }

    res.json({ submitted: true, feedbackId, ...(txHash ? { txHash } : {}) });
  } catch (err) {
    next(err);
  }
});

export default router;
