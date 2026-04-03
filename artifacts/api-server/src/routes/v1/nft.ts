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

function handleToIdenticon(handle: string): boolean[][] {
  let hash = 5381;
  for (const c of handle) {
    hash = ((hash << 5) + hash) ^ c.charCodeAt(0);
  }
  hash = Math.abs(hash);
  const cells: boolean[][] = [];
  for (let row = 0; row < 5; row++) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < 3; col++) {
      rowCells.push(((hash >> (row * 3 + col)) & 1) === 1);
    }
    cells.push([rowCells[0], rowCells[1], rowCells[2], rowCells[1], rowCells[0]]);
  }
  return cells;
}

function renderIdenticon(handle: string, x: number, y: number, cellSize: number, gap: number): string {
  const cells = handleToIdenticon(handle);
  const parts: string[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = x + col * (cellSize + gap);
      const cy = y + row * (cellSize + gap);
      const fill = cells[row][col] ? 'url(#id-grad)' : 'rgba(255,255,255,0.04)';
      parts.push(`<rect x="${cx}" y="${cy}" width="${cellSize}" height="${cellSize}" rx="3" fill="${fill}"/>`);
    }
  }
  return parts.join('\n  ');
}

function trustArc(trustPct: number, cx: number, cy: number, r: number, color: string): string {
  const circ = 2 * Math.PI * r;
  const offset = circ - (trustPct / 100) * circ;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
    stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
    stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>`;
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
    const nftStatus = agent?.nftStatus ?? "none";

    const isMinted = nftStatus === "minted" || nftStatus === "pending_claim" || nftStatus === "active";
    const tierShort = tier === "premium" ? (handle.replace(/[^a-z0-9]/gi, "").length <= 3 ? "ULTRA RARE" : "RARE") : "STANDARD";
    const handleDisplay16 = handle.length > 16 ? handle.slice(0, 14) + "…" : handle;
    const displayNameTrunc = displayName.length > 24 ? displayName.slice(0, 22) + "…" : displayName;

    const tierColor = tier === "premium" ? "#f59e0b" : "#4f7df3";
    const tierBg = tier === "premium" ? "rgba(245,158,11,0.1)" : "rgba(79,125,243,0.1)";
    const tierBorder = tier === "premium" ? "rgba(245,158,11,0.25)" : "rgba(79,125,243,0.25)";

    const trustPct = Math.min(100, Math.max(0, trustScore));
    const trustColor = trustPct >= 80 ? "#34d399" : trustPct >= 50 ? "#f59e0b" : "#ef4444";
    const trustGlow = trustPct >= 80 ? "rgba(52,211,153,0.25)" : trustPct >= 50 ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.25)";

    const identicon = renderIdenticon(handle, 388, 24, 14, 2);
    const arc = trustArc(trustPct, 60, 395, 32, trustColor);
    const barFill = (trustPct / 100) * 280;

    const baseBadge = isMinted
      ? `<rect x="318" y="448" width="100" height="22" rx="7" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.2)" stroke-width="1"/>
  <text x="368" y="463" font-family="JetBrains Mono, monospace" font-size="9" fill="#34d399" text-anchor="middle" font-weight="600">&#x2B21; BASE NFT</text>`
      : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <defs>
    <radialGradient id="bg" cx="25%" cy="20%" r="90%">
      <stop offset="0%" stop-color="#0e1535"/>
      <stop offset="60%" stop-color="#080c1f"/>
      <stop offset="100%" stop-color="#05071a"/>
    </radialGradient>
    <linearGradient id="top-line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#4f7df3"/>
      <stop offset="50%" stop-color="#7c5bf5"/>
      <stop offset="100%" stop-color="#4f7df3" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="id-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f7df3"/>
      <stop offset="100%" stop-color="#7c5bf5"/>
    </linearGradient>
    <linearGradient id="trust-bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.04)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.02)"/>
    </linearGradient>
    <filter id="glow-${handle}">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft-${handle}">
      <feGaussianBlur stdDeviation="20" result="blur"/>
    </filter>
    <pattern id="dots-${handle}" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.035)"/>
    </pattern>
    <clipPath id="clip-${handle}"><rect width="500" height="500" rx="24"/></clipPath>
  </defs>

  <rect width="500" height="500" rx="24" fill="url(#bg)"/>
  <rect width="500" height="500" rx="24" fill="url(#dots-${handle})" clip-path="url(#clip-${handle})"/>

  <!-- Subtle radial glow top-left -->
  <ellipse cx="80" cy="80" rx="160" ry="140" fill="${trustGlow}" filter="url(#soft-${handle})" opacity="0.5"/>

  <!-- Border -->
  <rect width="500" height="500" rx="24" fill="none" stroke="rgba(79,125,243,0.18)" stroke-width="1.5"/>

  <!-- Top accent line -->
  <rect x="0" y="0" width="500" height="3" rx="1.5" fill="url(#top-line)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="3" height="500" rx="1.5" fill="rgba(79,125,243,0.45)"/>

  <!-- AGENT ID CREDENTIAL pill -->
  <rect x="24" y="24" width="192" height="24" rx="7" fill="rgba(79,125,243,0.07)" stroke="rgba(79,125,243,0.14)" stroke-width="1"/>
  <text x="36" y="40" font-family="JetBrains Mono, monospace" font-size="10" fill="rgba(79,125,243,0.65)" font-weight="700" letter-spacing="2.5">AGENT ID CREDENTIAL</text>

  <!-- Identicon (5x5 symmetric, top-right) -->
  ${identicon}

  <!-- Handle name -->
  <text x="24" y="150" font-family="Bricolage Grotesque, Inter, sans-serif" font-size="60" font-weight="800" fill="#eaeaf5" letter-spacing="-2.5">${handleDisplay16}</text>

  <!-- .agentid domain -->
  <text x="26" y="180" font-family="JetBrains Mono, monospace" font-size="15" fill="#4f7df3" opacity="0.75">.agentid</text>

  <!-- Display name -->
  <text x="26" y="218" font-family="Inter, sans-serif" font-size="15" fill="rgba(234,234,245,0.45)">${displayNameTrunc}</text>

  <!-- Divider -->
  <rect x="24" y="238" width="452" height="1" fill="rgba(255,255,255,0.05)"/>

  <!-- Trust score label -->
  <text x="24" y="275" font-family="JetBrains Mono, monospace" font-size="10" fill="rgba(234,234,245,0.25)" font-weight="700" letter-spacing="2">TRUST SCORE</text>

  <!-- Trust bar track -->
  <rect x="24" y="284" width="280" height="6" rx="3" fill="rgba(255,255,255,0.05)"/>
  <!-- Trust bar fill -->
  <rect x="24" y="284" width="${barFill.toFixed(1)}" height="6" rx="3" fill="${trustColor}" opacity="0.85"/>

  <!-- Trust number -->
  <text x="316" y="291" font-family="JetBrains Mono, monospace" font-size="20" fill="${trustColor}" font-weight="800">${trustScore}</text>

  <!-- Trust arc (decorative ring bottom-left) -->
  ${arc}
  <text x="60" y="401" font-family="JetBrains Mono, monospace" font-size="13" fill="${trustColor}" font-weight="800" text-anchor="middle">${trustScore}</text>
  <text x="60" y="416" font-family="JetBrains Mono, monospace" font-size="8" fill="rgba(234,234,245,0.25)" text-anchor="middle" letter-spacing="1">TRUST</text>

  <!-- Tier badge -->
  <rect x="110" y="376" width="${tierShort.length * 7 + 30}" height="26" rx="8" fill="${tierBg}" stroke="${tierBorder}" stroke-width="1"/>
  <text x="125" y="393" font-family="JetBrains Mono, monospace" font-size="10.5" fill="${tierColor}" font-weight="700">${tierShort}</text>

  <!-- Horizontal divider above bottom row -->
  <rect x="24" y="438" width="452" height="1" fill="rgba(255,255,255,0.04)"/>

  <!-- Base badge (conditional) -->
  ${baseBadge}

  <!-- getagent.id watermark -->
  <text x="476" y="484" font-family="JetBrains Mono, monospace" font-size="9" fill="rgba(234,234,245,0.12)" text-anchor="end" letter-spacing="0.5">getagent.id</text>
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
