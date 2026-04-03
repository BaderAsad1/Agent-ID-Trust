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

function handleToIdenticon15x15(handle: string): boolean[][] {
  // 15×8 = 120 unique bits, mirrored to 15×15. 4 hashes × 30 bits each.
  const hashes = [0x12345678, 0xdeadbeef, 0xabcdef01, 0x55aa55aa].map((seed, i) => {
    let h = seed;
    for (const c of handle) h = (((h << 5) + h) ^ c.charCodeAt(0) ^ (i * 0x1234567)) | 0;
    return Math.abs(h);
  });
  const cells: boolean[][] = [];
  for (let row = 0; row < 15; row++) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < 8; col++) {
      const bitIdx = row * 8 + col;
      const src = hashes[Math.min(Math.floor(bitIdx / 30), 3)];
      rowCells.push(((src >> (bitIdx % 30)) & 1) === 1);
    }
    cells.push([
      rowCells[0], rowCells[1], rowCells[2], rowCells[3], rowCells[4], rowCells[5], rowCells[6], rowCells[7],
      rowCells[6], rowCells[5], rowCells[4], rowCells[3], rowCells[2], rowCells[1], rowCells[0],
    ]);
  }
  return cells;
}

function renderIdenticon15x15(handle: string, x: number, y: number, cellSize: number, gap: number, gradId: string): string {
  const cells = handleToIdenticon15x15(handle);
  const parts: string[] = [];
  const dim = 15;
  for (let row = 0; row < dim; row++) {
    for (let col = 0; col < dim; col++) {
      const cx = x + col * (cellSize + gap);
      const cy = y + row * (cellSize + gap);
      const active = cells[row][col];
      const edgeDist = Math.min(row, dim - 1 - row, col, dim - 1 - col);
      const opacity = active ? (edgeDist === 0 ? 0.38 : edgeDist === 1 ? 0.62 : edgeDist === 2 ? 0.82 : 1.0) : 0.03;
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cellSize}" height="${cellSize}" rx="2" fill="${active ? `url(#${gradId})` : "rgba(255,255,255,0.03)"}" opacity="${opacity}"/>`
      );
    }
  }
  return parts.join("\n  ");
}

function renderSkillPills(skills: string[], accentA: string, startX: number, startY: number, maxX: number): string {
  if (skills.length === 0) return "";
  const parts: string[] = [];
  let cx = startX, cy = startY;
  const rowH = 30, gap = 6, maxDisplay = 6;
  const displayed = skills.slice(0, maxDisplay);
  for (const skill of displayed) {
    const label = skill.length > 15 ? skill.slice(0, 13) + "…" : skill;
    const w = Math.ceil(label.length * 6.8 + 18);
    if (cx + w > maxX && cx > startX) { cx = startX; cy += rowH; }
    parts.push(
      `<rect x="${cx}" y="${cy}" width="${w}" height="22" rx="6" fill="${accentA}" fill-opacity="0.09" stroke="${accentA}" stroke-opacity="0.22" stroke-width="1"/>`,
      `<text x="${cx + 9}" y="${cy + 15}" font-family="JetBrains Mono, Courier New, monospace" font-size="9.5" fill="${accentA}" font-weight="600">${label}</text>`,
    );
    cx += w + gap;
  }
  if (skills.length > maxDisplay) {
    const more = `+${skills.length - maxDisplay}`;
    const w = more.length * 7 + 14;
    if (cx + w > maxX) { cx = startX; cy += rowH; }
    parts.push(
      `<rect x="${cx}" y="${cy}" width="${w}" height="22" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`,
      `<text x="${cx + 7}" y="${cy + 15}" font-family="JetBrains Mono, Courier New, monospace" font-size="9.5" fill="rgba(234,234,245,0.35)">${more}</text>`,
    );
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
        chainRegistrations: true,
        chainMints: true,
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
        capabilities: true,
      },
    });

    const hasAgent = !!agent;
    const displayName = hasAgent ? (agent.displayName || null) : null;
    const trustScore = agent?.trustScore ?? 0;
    const skills: string[] = (agent?.capabilities as string[] | null) ?? [];

    const [accentA, accentB] = handlePalette(handle);

    const hl = handle.length;
    // Font size for handle name — safe range that always fits inside x=22..300
    const handleFontSize = hl <= 2 ? 82 : hl <= 3 ? 72 : hl <= 5 ? 60 : hl <= 8 ? 48 : hl <= 12 ? 38 : 28;
    const handleDisplay = handle.length > 17 ? handle.slice(0, 15) + "…" : handle;
    const displayNameTrunc = displayName ? (displayName.length > 30 ? displayName.slice(0, 28) + "…" : displayName) : null;

    const trustPct = Math.min(100, Math.max(0, trustScore));
    const trustColor = trustPct >= 80 ? "#34d399" : trustPct >= 50 ? "#f59e0b" : "#ef4444";
    const barFill = (trustPct / 100) * 300;

    // Identicon: 15×15 grid, cell=11 gap=1 → 179px square. Anchored top-right at x=308 y=22.
    const identicon = renderIdenticon15x15(handle, 308, 22, 11, 1, "id-grad");
    const traces = generateTraces(handle);
    // Ring: cx=56, cy=392, r=28
    const arc = trustArcSvg(trustPct, 56, 392, 28, trustColor);

    // All y-positions are FIXED — nothing shifts based on handle length.
    // Top section fits in y=20..258; bottom section y=258..500.
    const handleY    = 190;   // handle name baseline (font fills upward from here)
    const domainY    = 218;   // .agentid — always 20px bold accent, always visible
    const nameY      = 242;   // display name — 13px muted, only rendered if linked
    const divider1Y  = 260;
    const divider2Y  = 326;

    const displayNameSvg = displayNameTrunc
      ? `<text x="24" y="${nameY}" font-family="Segoe UI, system-ui, sans-serif" font-size="13" fill="rgba(230,232,255,0.38)">${displayNameTrunc}</text>`
      : "";

    const skillsSvg = hasAgent
      ? skills.length > 0
        ? `<text x="104" y="344" font-family="JetBrains Mono, Courier New, monospace" font-size="9" fill="rgba(230,232,255,0.22)" font-weight="700" letter-spacing="2">AGENT SKILLS</text>
  ${renderSkillPills(skills, accentA, 104, 356, 468)}`
        : `<text x="104" y="372" font-family="JetBrains Mono, Courier New, monospace" font-size="10" fill="rgba(230,232,255,0.14)">No skills listed</text>`
      : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <defs>
    <radialGradient id="bg-r" cx="26%" cy="20%" r="88%">
      <stop offset="0%" stop-color="#0c1228"/>
      <stop offset="50%" stop-color="#07091a"/>
      <stop offset="100%" stop-color="#040610"/>
    </radialGradient>
    <linearGradient id="top-line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accentA}"/>
      <stop offset="45%" stop-color="${accentB}"/>
      <stop offset="100%" stop-color="${accentA}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="id-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accentA}"/>
      <stop offset="100%" stop-color="${accentB}"/>
    </linearGradient>
    <linearGradient id="bar-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${trustColor}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${trustColor}" stop-opacity="0.45"/>
    </linearGradient>
    <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.9" fill="rgba(255,255,255,0.028)"/>
    </pattern>
    <clipPath id="card-clip"><rect width="500" height="500" rx="20"/></clipPath>
  </defs>

  <rect width="500" height="500" rx="20" fill="url(#bg-r)"/>
  <rect width="500" height="500" rx="20" fill="url(#dots)" clip-path="url(#card-clip)"/>
  ${traces}
  <rect width="500" height="500" rx="20" fill="none" stroke="${accentA}" stroke-opacity="0.16" stroke-width="1.5"/>
  <rect x="0" y="0" width="500" height="3" rx="1.5" fill="url(#top-line)"/>
  <rect x="0" y="0" width="3" height="500" rx="1.5" fill="${accentA}" opacity="0.55"/>

  <!-- AGENT ID CREDENTIAL label -->
  <rect x="22" y="20" width="200" height="24" rx="6" fill="${accentA}" fill-opacity="0.07" stroke="${accentA}" stroke-opacity="0.15" stroke-width="1"/>
  <text x="33" y="36" font-family="JetBrains Mono, Courier New, monospace" font-size="9.5" fill="${accentA}" opacity="0.65" font-weight="700" letter-spacing="2.5">AGENT ID CREDENTIAL</text>

  <!-- 15×15 identicon (top-right) -->
  ${identicon}

  <!-- Handle name (left column, fixed baseline y=190) -->
  <text x="22" y="${handleY}" font-family="Bricolage Grotesque, Segoe UI, system-ui, sans-serif" font-size="${handleFontSize}" font-weight="800" fill="#ecedff" letter-spacing="-1.5">${handleDisplay}</text>

  <!-- .agentid (fixed y=218, 20px bold accent — always prominent) -->
  <text x="24" y="${domainY}" font-family="JetBrains Mono, Courier New, monospace" font-size="20" fill="${accentA}" font-weight="600" opacity="0.9">.agentid</text>

  <!-- Display name (fixed y=242, only if agent linked) -->
  ${displayNameSvg}

  <!-- Divider 1 -->
  <rect x="22" y="${divider1Y}" width="456" height="1" fill="rgba(255,255,255,0.06)"/>

  <!-- TRUST SCORE -->
  <text x="22" y="286" font-family="JetBrains Mono, Courier New, monospace" font-size="9" fill="rgba(230,232,255,0.22)" font-weight="700" letter-spacing="2.5">TRUST SCORE</text>
  <rect x="22" y="294" width="300" height="6" rx="3" fill="rgba(255,255,255,0.05)"/>
  <rect x="22" y="294" width="${barFill.toFixed(1)}" height="6" rx="3" fill="url(#bar-grad)"/>
  <text x="334" y="303" font-family="JetBrains Mono, Courier New, monospace" font-size="18" fill="${trustColor}" font-weight="800">${trustScore}</text>

  <!-- Divider 2 -->
  <rect x="22" y="${divider2Y}" width="456" height="1" fill="rgba(255,255,255,0.04)"/>

  <!-- Trust ring (fixed: cx=56 cy=392 r=28) -->
  ${arc}
  <text x="56" y="397" font-family="JetBrains Mono, Courier New, monospace" font-size="13" fill="${trustColor}" font-weight="800" text-anchor="middle">${trustScore}</text>
  <text x="56" y="412" font-family="JetBrains Mono, Courier New, monospace" font-size="8" fill="rgba(230,232,255,0.2)" text-anchor="middle" letter-spacing="1">/100</text>

  <!-- Agent Skills (right of ring, fixed start x=104) -->
  ${skillsSvg}

  <!-- Bottom rule -->
  <rect x="22" y="438" width="456" height="1" fill="rgba(255,255,255,0.04)"/>
  <text x="478" y="476" font-family="JetBrains Mono, Courier New, monospace" font-size="9" fill="rgba(230,232,255,0.09)" text-anchor="end" letter-spacing="0.5">getagent.id</text>
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
