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
        onChainTokenId: true,
        chainMints: true,
        createdAt: true,
      },
    });

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", `Handle "${handle}" not found`);
    }

    const handleLen = handle.replace(/[^a-z0-9]/gi, "").length;
    const chains = agent.nftStatus === "minted" || agent.nftStatus === "pending_claim" ? ["Base"] : [];
    const registeredDate = agent.handleRegisteredAt
      ? new Date(agent.handleRegisteredAt).toISOString().split("T")[0]
      : new Date(agent.createdAt).toISOString().split("T")[0];

    const imageUrl = `${process.env.APP_URL || "https://getagent.id"}/api/v1/handles/${handle}/image.svg`;
    const externalUrl = `${process.env.APP_URL || "https://getagent.id"}/${handle}`;

    const metadata = {
      name: `${handle}.agentid`,
      description: `Agent ID handle: ${handle}.agentid — a unique on-chain identity for AI agents on the Agent ID network.`,
      image: imageUrl,
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

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.handle, handle),
      columns: {
        id: true,
        handle: true,
        displayName: true,
        trustScore: true,
        handleTier: true,
        nftStatus: true,
      },
    });

    const displayName = agent?.displayName || handle;
    const trustScore = agent?.trustScore ?? 0;
    const tier = getTierFromHandle(handle);
    const tierLabel = getTierLabel(handle);
    const nftStatus = agent?.nftStatus ?? "none";

    const tierColor = tier === "premium" ? "#f59e0b" : "#4f7df3";
    const tierBg = tier === "premium" ? "rgba(245,158,11,0.12)" : "rgba(79,125,243,0.12)";
    const tierBorder = tier === "premium" ? "rgba(245,158,11,0.3)" : "rgba(79,125,243,0.3)";

    const trustPct = Math.min(100, Math.max(0, trustScore));
    const trustColor = trustPct >= 80 ? "#34d399" : trustPct >= 50 ? "#f59e0b" : "#ef4444";

    const handleDisplay = handle.length > 16 ? handle.slice(0, 14) + "…" : handle;
    const displayNameTrunc = displayName.length > 22 ? displayName.slice(0, 20) + "…" : displayName;

    const onChainBadge = nftStatus === "minted" || nftStatus === "pending_claim"
      ? `<rect x="16" y="180" width="96" height="20" rx="6" fill="rgba(52,211,153,0.12)" stroke="rgba(52,211,153,0.3)" stroke-width="1"/>
         <text x="64" y="194" font-family="'JetBrains Mono', monospace" font-size="9" fill="#34d399" text-anchor="middle" font-weight="600">⬡ BASE NFT</text>`
      : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#07091a"/>
      <stop offset="100%" style="stop-color:#0a0d22"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#4f7df3;stop-opacity:0.5"/>
      <stop offset="100%" style="stop-color:#7c5bf5;stop-opacity:0"/>
    </linearGradient>
    <clipPath id="card-clip">
      <rect width="400" height="220" rx="16"/>
    </clipPath>
  </defs>

  <rect width="400" height="220" rx="16" fill="url(#bg)"/>
  <rect width="400" height="220" rx="16" fill="none" stroke="rgba(79,125,243,0.2)" stroke-width="1"/>

  <rect x="0" y="0" width="400" height="2" rx="1" fill="url(#accent)"/>
  <rect x="0" y="0" width="3" height="220" rx="1.5" fill="rgba(79,125,243,0.4)"/>

  <rect x="16" y="14" width="130" height="16" rx="4" fill="rgba(79,125,243,0.08)"/>
  <text x="24" y="25" font-family="'JetBrains Mono', monospace" font-size="9" fill="rgba(232,232,240,0.35)" font-weight="600" letter-spacing="2">AGENT ID CREDENTIAL</text>

  <text x="16" y="58" font-family="'Bricolage Grotesque', 'Inter', sans-serif" font-size="26" font-weight="700" fill="#e8e8f0" letter-spacing="-0.5">${handleDisplay}</text>
  <text x="16" y="74" font-family="'JetBrains Mono', monospace" font-size="11" fill="rgba(79,125,243,0.7)">.agentid</text>

  <text x="16" y="102" font-family="'Inter', sans-serif" font-size="13" fill="rgba(232,232,240,0.55)">${displayNameTrunc}</text>

  <rect x="16" y="114" width="368" height="1" fill="rgba(255,255,255,0.05)"/>

  <text x="16" y="136" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="rgba(232,232,240,0.25)" letter-spacing="1" font-weight="600">TRUST SCORE</text>
  <rect x="16" y="142" width="200" height="4" rx="2" fill="rgba(255,255,255,0.05)"/>
  <rect x="16" y="142" width="${(trustPct / 100) * 200}" height="4" rx="2" fill="${trustColor}"/>
  <text x="224" y="147" font-family="'JetBrains Mono', monospace" font-size="11" fill="${trustColor}" font-weight="700">${trustScore}</text>

  <rect x="16" y="156" width="${tierLabel.length * 5.8 + 16}" height="20" rx="6" fill="${tierBg}" stroke="${tierBorder}" stroke-width="1"/>
  <text x="24" y="170" font-family="'JetBrains Mono', monospace" font-size="9" fill="${tierColor}" font-weight="600">${tierLabel}</text>

  ${onChainBadge}

  <text x="384" y="210" font-family="'JetBrains Mono', monospace" font-size="8" fill="rgba(232,232,240,0.15)" text-anchor="end">getagent.id</text>
</svg>`;

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
        onChainTokenId: true,
        chainRegistrations: true,
        chainMints: true,
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
