import { Router } from "express";
import { z } from "zod/v4";
import { eq, and } from "drizzle-orm";
import { AppError } from "../../middlewares/error-handler";
import { requireAuth } from "../../middlewares/replit-auth";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { logger } from "../../middlewares/request-logger";
import { transferToUser, BaseChainError, isOnchainMintingEnabled } from "../../services/chains/base";
import type { Address } from "viem";
import { agentOwnerFilter } from "../../services/agents";
import { generateHandleCardSvg, generateHandleCardSvgDataUri } from "../../lib/handle-card-svg";

const router = Router();

function getTierFromHandle(handle: string): string {
  const len = handle.replace(/[^a-z0-9]/gi, "").length;
  if (len <= 3) return "premium";
  if (len === 4) return "premium";
  return "standard";
}

function getTierLabel(handle: string): string {
  const len = handle.replace(/[^a-z0-9]/gi, "").length;
  if (len <= 3) return "Ultra-Premium (3-char)";
  if (len === 4) return "Premium (4-char)";
  return "Standard (5+ char)";
}

function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

router.get("/metadata/:handle", async (req, res, next) => {
  try {
    const handle = (req.params.handle as string).toLowerCase();

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.handle, handle),
      columns: {
        id: true,
        handle: true,
        displayName: true,
        trustScore: true,
        handleTier: true,
        handleRegisteredAt: true,
        nftStatus: true,
        // onChainTokenId is the ERC-8004 NFT tokenId stored at mint time — NOT a canonical
        // identity anchor key. Intentionally retained for NFT metadata display.
        onChainTokenId: true,
        chainRegistrations: true,
        createdAt: true,
      },
    });

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", `Handle "${handle}" not found`);
    }

    const handleLen = handle.replace(/[^a-z0-9]/gi, "").length;

    const chainRegs = Array.isArray(agent.chainRegistrations)
      ? (agent.chainRegistrations as Array<Record<string, unknown>>)
      : [];
    const isBaseAnchored = chainRegs.some(
      (r) => typeof r.chain === "string" && r.chain.toLowerCase().startsWith("base"),
    ) || agent.nftStatus === "active" || agent.nftStatus === "minted" || agent.nftStatus === "pending_claim";
    const chains = isBaseAnchored ? ["Base"] : [];
    const registeredDate = agent.handleRegisteredAt
      ? new Date(agent.handleRegisteredAt).toISOString().split("T")[0]
      : new Date(agent.createdAt).toISOString().split("T")[0];

    const imageUrl = `${process.env.APP_URL || "https://getagent.id"}/api/v1/handles/${handle}/image.svg`;
    const externalUrl = `${process.env.APP_URL || "https://getagent.id"}/${handle}`;
    const imageData = generateHandleCardSvgDataUri(handle);

    const metadata = {
      name: `${handle}.agentid`,
      description: `Agent ID handle: ${handle}.agentid — a unique on-chain identity for AI agents on the Agent ID network.`,
      image: imageUrl,
      image_data: imageData,
      external_url: externalUrl,
      attributes: [
        {
          trait_type: "Handle Length",
          value: handleLen,
          display_type: "number",
        },
        {
          trait_type: "Tier",
          value: getTierLabel(handle),
        },
        {
          trait_type: "Trust Score",
          value: agent.trustScore ?? 0,
          display_type: "number",
        },
        {
          trait_type: "Registered",
          value: registeredDate,
          display_type: "date",
        },
        {
          trait_type: "Chains",
          value: chains.length > 0 ? chains.join(", ") : "Off-chain",
        },
        {
          trait_type: "NFT Status",
          value: agent.nftStatus ?? "none",
        },
      ],
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
    res.json(metadata);
  } catch (err) {
    next(err);
  }
});

router.get("/handles/:handle/image.svg", async (req, res, next) => {
  try {
    const handle = (req.params.handle as string).toLowerCase();
    const svg = generateHandleCardSvg(handle);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.send(svg);
  } catch (err) {
    next(err);
  }
});

const transferSchema = z.object({
  destinationAddress: z.string().min(1).max(100),
});

router.post("/handles/:handle/transfer", requireAuth, async (req, res, next) => {
  try {
    const handle = (req.params.handle as string).toLowerCase();
    const userId = req.userId!;

    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "destinationAddress is required", parsed.error.issues);
    }

    const { destinationAddress } = parsed.data;

    if (!isValidEvmAddress(destinationAddress)) {
      throw new AppError(400, "INVALID_ADDRESS", "destinationAddress must be a valid EVM address (0x...)");
    }

    const agent = await db.query.agentsTable.findFirst({
      where: and(
        eq(agentsTable.handle, handle),
        agentOwnerFilter(userId),
      ),
      columns: {
        id: true,
        handle: true,
        userId: true,
        nftStatus: true,
        nftCustodian: true,
        // onChainTokenId is the ERC-8004 NFT tokenId stored at mint time — NOT a canonical
        // identity anchor key. Intentionally retained for NFT claim status.
        onChainTokenId: true,
        chainRegistrations: true,
      },
    });

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Handle not found or you do not own this handle");
    }

    // Accept both the canonical nftStatus=active (registrar path) and legacy minted status
    const validStatuses = ["active", "minted"];
    if (!validStatuses.includes(agent.nftStatus ?? "")) {
      throw new AppError(400, "NOT_ANCHORED", `Handle NFT is not anchored on-chain. Current status: ${agent.nftStatus}`);
    }

    if (agent.nftCustodian !== "platform") {
      throw new AppError(400, "NOT_IN_CUSTODY", `Handle NFT is not in platform custody. Current custodian: ${agent.nftCustodian ?? "none"}`);
    }

    logger.info({ agentId: agent.id, handle, destinationAddress }, "[nft] Transfer requested via registrar path");

    // Fail-closed: on-chain transfer MUST succeed before DB commit to prevent divergence.
    if (!isOnchainMintingEnabled()) {
      throw new AppError(503, "ONCHAIN_REQUIRED", "On-chain transfers are not enabled on this server. Enable ONCHAIN_MINTING_ENABLED to allow handle NFT transfers.");
    }

    let txHash: string | undefined;

    const result = await transferToUser(handle, destinationAddress as Address);
    if (!result) {
      // Null means chain adapter not configured — treat as hard failure to prevent DB divergence.
      throw new AppError(500, "TRANSFER_FAILED", "transferToUser returned null — chain adapter not configured or contract address missing");
    }
    txHash = result.txHash;

    const { nftAuditLogTable } = await import("@workspace/db/schema");

    await db
      .update(agentsTable)
      .set({
        nftCustodian: "user",
        nftOwnerWallet: destinationAddress.toLowerCase(),
        onChainOwner: destinationAddress.toLowerCase(),
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    await db.insert(nftAuditLogTable).values({
      agentId: agent.id,
      handle,
      action: "claim",
      chain: "base",
      txHash: txHash ?? null,
      toAddress: destinationAddress.toLowerCase(),
      custodian: "user",
      status: "success",
      metadata: { destinationAddress, source: "nft-transfer-route" },
    });

    logger.info({ agentId: agent.id, handle, destinationAddress, txHash }, "[nft] Transfer complete via registrar path");

    res.json({
      txHash,
      status: "transferred",
      handle,
      destinationAddress: destinationAddress.toLowerCase(),
      message: `Handle NFT transferred to ${destinationAddress}`,
    });
  } catch (err) {
    if (err instanceof BaseChainError) {
      if (err.code === "CHAIN_NOT_CONFIGURED") {
        return next(new AppError(503, "CHAIN_NOT_CONFIGURED", "NFT transfers are not available in this environment"));
      }
      if (err.code === "NOT_IN_CUSTODY") {
        return next(new AppError(400, "NOT_IN_CUSTODY", err.message));
      }
      return next(new AppError(500, "TRANSFER_FAILED", err.message));
    }
    next(err);
  }
});

export default router;
