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

const PALETTES: Array<[string, string]> = [
  ["#4f7df3", "#7c5bf5"],
  ["#34d399", "#059669"],
  ["#f59e0b", "#d97706"],
  ["#06b6d4", "#0891b2"],
  ["#ec4899", "#db2777"],
  ["#8b5cf6", "#6d28d9"],
  ["#f97316", "#ea580c"],
  ["#22d3ee", "#0e7490"],
];

function handlePalette(handle: string): [string, string] {
  let hash = 5381;
  for (const c of handle) hash = ((hash << 5) + hash) ^ c.charCodeAt(0);
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

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

function handleToIdenticon9x9(handle: string): boolean[][] {
  let h1 = 5381, h2 = 0x12345678;
  for (const c of handle) {
    const code = c.charCodeAt(0);
    h1 = ((h1 << 5) + h1) ^ code;
    h2 = Math.imul(h2 ^ code, 0x9e3779b9);
  }
  h1 = Math.abs(h1); h2 = Math.abs(h2);
  const cells: boolean[][] = [];
  for (let row = 0; row < 9; row++) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < 5; col++) {
      const bitIdx = row * 5 + col;
      const src = bitIdx < 31 ? h1 : h2;
      rowCells.push(((src >> (bitIdx % 31)) & 1) === 1);
    }
    cells.push([
      rowCells[0], rowCells[1], rowCells[2], rowCells[3], rowCells[4],
      rowCells[3], rowCells[2], rowCells[1], rowCells[0],
    ]);
  }
  return cells;
}

function renderIdenticon9x9(
  handle: string, x: number, y: number,
  cellSize: number, gap: number,
  accentA: string, accentB: string,
  gradId: string,
): string {
  const cells = handleToIdenticon9x9(handle);
  const parts: string[] = [];
  const dim = 9;
  for (let row = 0; row < dim; row++) {
    for (let col = 0; col < dim; col++) {
      const cx = x + col * (cellSize + gap);
      const cy = y + row * (cellSize + gap);
      const active = cells[row][col];
      // Vary opacity towards edges for a vignette feel
      const edgeDist = Math.min(row, dim - 1 - row, col, dim - 1 - col);
      const opacity = active ? (edgeDist === 0 ? 0.55 : edgeDist === 1 ? 0.75 : 1) : 0.04;
      const fill = active ? `url(#${gradId})` : "rgba(255,255,255,0.04)";
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cellSize}" height="${cellSize}" rx="3" fill="${fill}" opacity="${opacity}"/>`
      );
      void accentA; void accentB;
    }
  }
  return parts.join("\n  ");
}

function generateTraces(handle: string): string {
  let seed = 0x6d2b4e1a;
  for (const c of handle) seed = ((seed * 31) + c.charCodeAt(0)) >>> 0;
  const traces: string[] = [];
  for (let i = 0; i < 4; i++) {
    const y = 100 + (((seed >>> (i * 8)) & 0xFF) / 255) * 220;
    const x2 = 160 + (((seed >>> (i * 8 + 4)) & 0x3F) / 63) * 100;
    const dropY = y + (((seed >>> (i * 8 + 2)) & 0x1F) - 16) * 3;
    traces.push(
      `<path d="M4 ${y.toFixed(1)} H ${x2.toFixed(1)} V ${dropY.toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1.5"/>`,
    );
    traces.push(`<circle cx="${x2.toFixed(1)}" cy="${dropY.toFixed(1)}" r="2.5" fill="rgba(255,255,255,0.08)"/>`);
  }
  return traces.join("\n  ");
}

function trustArcSvg(trustPct: number, cx: number, cy: number, r: number, color: string): string {
  const circ = 2 * Math.PI * r;
  const offset = circ - (trustPct / 100) * circ;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="5.5"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="5.5"
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

    const [accentA, accentB] = handlePalette(handle);
    const isMinted = nftStatus === "minted" || nftStatus === "pending_claim" || nftStatus === "active";
    const tierShort = tier === "premium" ? (handle.replace(/[^a-z0-9]/gi, "").length <= 3 ? "ULTRA RARE" : "RARE") : "STANDARD";

    const hl = handle.length;
    const handleFontSize = hl <= 3 ? 80 : hl <= 5 ? 68 : hl <= 8 ? 56 : hl <= 12 ? 44 : 34;
    const handleDisplay = handle.length > 17 ? handle.slice(0, 15) + "…" : handle;
    const displayNameTrunc = displayName.length > 26 ? displayName.slice(0, 24) + "…" : displayName;

    const tierColor = tier === "premium" ? "#f59e0b" : accentA;
    const tierBg = tier === "premium" ? "rgba(245,158,11,0.1)" : `rgba(79,125,243,0.1)`;
    const tierBorder = tier === "premium" ? "rgba(245,158,11,0.25)" : `rgba(79,125,243,0.25)`;

    const trustPct = Math.min(100, Math.max(0, trustScore));
    const trustColor = trustPct >= 80 ? "#34d399" : trustPct >= 50 ? "#f59e0b" : "#ef4444";
    const trustGlow = trustPct >= 80 ? "rgba(52,211,153,0.22)" : trustPct >= 50 ? "rgba(245,158,11,0.22)" : "rgba(239,68,68,0.22)";

    const barFill = (trustPct / 100) * 300;
    const arc = trustArcSvg(trustPct, 66, 420, 36, trustColor);
    const identicon = renderIdenticon9x9(handle, 302, 34, 16, 2, accentA, accentB, "id-grad");
    const traces = generateTraces(handle);

    const handleY = 200 + (80 - handleFontSize) * 0.5;
    const domainY = handleY + handleFontSize * 0.28;
    const nameY = domainY + 30;

    const baseBadge = isMinted
      ? `<rect x="340" y="456" width="110" height="24" rx="8" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.2)" stroke-width="1"/>
  <text x="395" y="472" font-family="JetBrains Mono, monospace" font-size="10" fill="#34d399" text-anchor="middle" font-weight="600">&#x2B21; BASE NFT</text>`
      : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <defs>
    <radialGradient id="bg-r" cx="28%" cy="22%" r="85%">
      <stop offset="0%" stop-color="#0d1430"/>
      <stop offset="55%" stop-color="#080b1e"/>
      <stop offset="100%" stop-color="#04060f"/>
    </radialGradient>
    <linearGradient id="top-line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accentA}"/>
      <stop offset="50%" stop-color="${accentB}"/>
      <stop offset="100%" stop-color="${accentA}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="id-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accentA}"/>
      <stop offset="100%" stop-color="${accentB}"/>
    </linearGradient>
    <linearGradient id="bar-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${trustColor}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${trustColor}" stop-opacity="0.55"/>
    </linearGradient>
    <filter id="glow-f">
      <feGaussianBlur stdDeviation="18" result="blur"/>
    </filter>
    <filter id="txt-glow">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.9" fill="rgba(255,255,255,0.03)"/>
    </pattern>
    <clipPath id="card-clip"><rect width="500" height="500" rx="22"/></clipPath>
  </defs>

  <!-- Base -->
  <rect width="500" height="500" rx="22" fill="url(#bg-r)"/>
  <rect width="500" height="500" rx="22" fill="url(#dots)" clip-path="url(#card-clip)"/>

  <!-- PCB traces -->
  ${traces}

  <!-- Ambient glow (accent) -->
  <ellipse cx="420" cy="80" rx="180" ry="150" fill="${accentA}" filter="url(#glow-f)" opacity="0.18"/>
  <!-- Ambient glow (trust) -->
  <ellipse cx="66" cy="420" rx="110" ry="100" fill="${trustColor}" filter="url(#glow-f)" opacity="0.22"/>

  <!-- Border -->
  <rect width="500" height="500" rx="22" fill="none" stroke="${accentA}" stroke-opacity="0.18" stroke-width="1.5"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="500" height="3" rx="1.5" fill="url(#top-line)"/>

  <!-- Left accent strip -->
  <rect x="0" y="0" width="3" height="500" rx="1.5" fill="${accentA}" opacity="0.6"/>

  <!-- AGENT ID CREDENTIAL badge -->
  <rect x="22" y="22" width="200" height="26" rx="7" fill="${accentA}" fill-opacity="0.07" stroke="${accentA}" stroke-opacity="0.16" stroke-width="1"/>
  <text x="34" y="39" font-family="JetBrains Mono, Courier New, monospace" font-size="10" fill="${accentA}" opacity="0.7" font-weight="700" letter-spacing="2.5">AGENT ID CREDENTIAL</text>

  <!-- 9x9 identicon (top-right) -->
  ${identicon}

  <!-- Handle name -->
  <text x="22" y="${handleY}" font-family="Bricolage Grotesque, Segoe UI, system-ui, sans-serif" font-size="${handleFontSize}" font-weight="800" fill="#eef0ff" letter-spacing="-2">${handleDisplay}</text>

  <!-- .agentid domain -->
  <text x="24" y="${domainY}" font-family="JetBrains Mono, Courier New, monospace" font-size="14" fill="${accentA}" opacity="0.8">.agentid</text>

  <!-- Display name -->
  <text x="24" y="${nameY}" font-family="Segoe UI, system-ui, sans-serif" font-size="14" fill="rgba(230,232,255,0.42)">${displayNameTrunc}</text>

  <!-- Divider -->
  <rect x="22" y="255" width="456" height="1" fill="rgba(255,255,255,0.06)"/>

  <!-- TRUST SCORE label -->
  <text x="22" y="290" font-family="JetBrains Mono, Courier New, monospace" font-size="9.5" fill="rgba(230,232,255,0.22)" font-weight="700" letter-spacing="2.5">TRUST SCORE</text>

  <!-- Bar track -->
  <rect x="22" y="298" width="300" height="7" rx="3.5" fill="rgba(255,255,255,0.05)"/>
  <!-- Bar fill -->
  <rect x="22" y="298" width="${barFill.toFixed(1)}" height="7" rx="3.5" fill="url(#bar-grad)"/>

  <!-- Score number -->
  <text x="334" y="307" font-family="JetBrains Mono, Courier New, monospace" font-size="18" fill="${trustColor}" font-weight="800">${trustScore}</text>

  <!-- Second divider -->
  <rect x="22" y="336" width="456" height="1" fill="rgba(255,255,255,0.04)"/>

  <!-- Trust arc ring -->
  ${arc}
  <text x="66" y="426" font-family="JetBrains Mono, Courier New, monospace" font-size="14" fill="${trustColor}" font-weight="800" text-anchor="middle">${trustScore}</text>
  <text x="66" y="443" font-family="JetBrains Mono, Courier New, monospace" font-size="8" fill="rgba(230,232,255,0.22)" text-anchor="middle" letter-spacing="1.5">/ 100</text>

  <!-- Tier badge -->
  <rect x="120" y="400" width="${tierShort.length * 7.2 + 28}" height="28" rx="8" fill="${tierBg}" stroke="${tierBorder}" stroke-width="1"/>
  <text x="134" y="419" font-family="JetBrains Mono, Courier New, monospace" font-size="10.5" fill="${tierColor}" font-weight="700">${tierShort}</text>

  <!-- Bottom rule -->
  <rect x="22" y="449" width="456" height="1" fill="rgba(255,255,255,0.04)"/>

  <!-- BASE NFT badge -->
  ${baseBadge}

  <!-- getagent.id watermark -->
  <text x="478" y="486" font-family="JetBrains Mono, Courier New, monospace" font-size="9" fill="rgba(230,232,255,0.1)" text-anchor="end" letter-spacing="0.5">getagent.id</text>
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
