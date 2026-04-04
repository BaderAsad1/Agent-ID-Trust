import { Router } from "express";
import { z } from "zod/v4";
import { eq, and, sql } from "drizzle-orm";
import { AppError } from "../../middlewares/error-handler";
import { validateHandle, isHandleAvailable, getHandleReservation, isHandleReserved, agentOwnerFilter } from "../../services/agents";
import { isHandleAvailableOnChain, isRegistrarReadable } from "../../services/chains/base";
import { getHandleTier, isHandleReserved as isHandleTierReserved } from "../../services/handle";
import { HANDLE_PRICING_TIERS, getHandlePricingTier } from "@workspace/shared-pricing";

function legacyPricingShape(handle: string) {
  const t = getHandlePricingTier(handle);
  return {
    tier: t.tier,
    annualPriceUsd: t.annualPriceUsd,
    annualPriceCents: t.annualPriceCents,
    description: t.description,
    includedWithPaidPlan: t.includedWithPaidPlan,
    onChainMintPrice: t.onChainMintPrice,
    onChainMintPriceDollars: t.onChainMintPriceDollars,
    includesOnChainMint: t.includesOnChainMint,
  };
}
import { requireAuth } from "../../middlewares/replit-auth";
import { db } from "@workspace/db";
import { agentsTable, handleAuctionsTable, handleTrademarkClaimsTable } from "@workspace/db/schema";
import { getStripe } from "../../services/stripe-client";
import { logger } from "../../middlewares/request-logger";

const router = Router();

const checkHandleSchema = z.object({
  handle: z.string().min(1).max(32),
});

router.get("/check", async (req, res, next) => {
  try {
    const parsed = checkHandleSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "handle query parameter is required");
    }

    const { handle } = parsed.data;
    const normalized = handle.toLowerCase();
    const validationError = validateHandle(normalized);
    if (validationError) {
      res.json({ available: false, handle: normalized, reason: validationError });
      return;
    }

    if (isHandleReserved(normalized)) {
      res.json({
        available: false,
        handle: normalized,
        status: "reserved",
        reserved: true,
        reservedReason: "brand_protection",
        message: "This handle is reserved for brand protection. If you are the legitimate brand owner, please contact support@getagent.id to claim it.",
      });
      return;
    }

    const reservation = await getHandleReservation(normalized);
    if (reservation.isReserved) {
      const pricing = legacyPricingShape(normalized);
      res.json({
        available: false,
        handle: normalized,
        status: "reserved",
        reserved: true,
        reservedReason: reservation.reservedReason,
        pricing,
      });
      return;
    }

    const activeAuction = await db
      .select()
      .from(handleAuctionsTable)
      .where(
        and(
          eq(handleAuctionsTable.handle, normalized),
          eq(handleAuctionsTable.settled, false),
        ),
      )
      .limit(1);

    if (activeAuction.length > 0) {
      const auction = activeAuction[0];
      res.json({
        available: false,
        handle: normalized,
        status: "in-auction",
        auction: {
          currentPrice: auction.currentPrice,
          currentPriceDollars: auction.currentPrice / 100,
          startPrice: auction.startPrice,
          reservePrice: auction.reservePrice,
          endsAt: auction.endsAt,
          bidUrl: `/api/v1/handles/auctions/${normalized}/bid`,
        },
      });
      return;
    }

    const existingAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.handle, normalized),
      columns: { id: true, handleExpiresAt: true },
    });

    if (existingAgent) {
      res.json({
        available: false,
        handle: normalized,
        status: "taken",
      });
      return;
    }

    const pricing = legacyPricingShape(normalized);

    const pendingClaim = await db
      .select({ id: handleTrademarkClaimsTable.id })
      .from(handleTrademarkClaimsTable)
      .where(
        and(
          eq(handleTrademarkClaimsTable.handle, normalized),
          eq(handleTrademarkClaimsTable.status, "pending"),
        ),
      )
      .limit(1);

    if (pendingClaim.length > 0) {
      res.json({
        available: false,
        handle: normalized,
        status: "reserved",
        reason: "This handle has a pending trademark claim",
      });
      return;
    }

    if (isRegistrarReadable()) {
      const onChainResult = await isHandleAvailableOnChain(normalized);
      if (onChainResult === null) {
        res.json({
          available: false,
          handle: normalized,
          status: "unavailable",
          reason: "registrar_unreachable",
        });
        return;
      }
      if (!onChainResult.available) {
        res.json({
          available: false,
          handle: normalized,
          status: "taken",
          reason: onChainResult.reason || "on_chain_unavailable",
        });
        return;
      }
    }

    res.json({
      available: true,
      handle: normalized,
      status: "available",
      tier: pricing.tier,
      annual: pricing.annualPriceCents,
      annualUsd: pricing.annualPriceUsd,
      includedWithPaidPlan: pricing.includedWithPaidPlan,
      onChainMintPrice: pricing.onChainMintPrice,
      onChainMintPriceDollars: pricing.onChainMintPriceDollars,
      includesOnChainMint: pricing.includesOnChainMint,
      pricing,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/pricing", (_req, res) => {
  res.json({ tiers: HANDLE_PRICING_TIERS });
});

const trademarkClaimSchema = z.object({
  claimantName: z.string().min(1).max(255),
  claimantEmail: z.string().email().max(255),
  trademarkNumber: z.string().max(100).optional(),
  jurisdiction: z.string().max(100).optional(),
  evidence: z.string().max(10000).optional(),
});

router.post("/:handle/trademark-claim", async (req, res, next) => {
  try {
    const handle = (req.params.handle as string).toLowerCase();
    const validationError = validateHandle(handle);
    if (validationError) {
      throw new AppError(400, "INVALID_HANDLE", validationError);
    }

    const parsed = trademarkClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const [claim] = await db.insert(handleTrademarkClaimsTable).values({
      handle,
      claimantName: parsed.data.claimantName,
      claimantEmail: parsed.data.claimantEmail,
      trademarkNumber: parsed.data.trademarkNumber,
      jurisdiction: parsed.data.jurisdiction,
      evidence: parsed.data.evidence,
    }).returning();

    try {
      const { sendTrademarkClaimEmail } = await import("../../services/email");
      const teamEmail = process.env.TEAM_EMAIL || "team@getagent.id";
      await sendTrademarkClaimEmail(teamEmail, handle, parsed.data.claimantName, parsed.data.claimantEmail);
    } catch (err) {
      logger.error({ err, handle }, "[handles] Failed to send trademark claim notification");
    }

    res.status(201).json({
      id: claim.id,
      handle: claim.handle,
      status: claim.status,
      createdAt: claim.createdAt,
      message: "Trademark claim submitted. Our team will review it within 5 business days.",
    });
  } catch (err) {
    next(err);
  }
});

const auctionBidSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

router.post("/auctions/:handle/bid", requireAuth, async (req, res, next) => {
  try {
    const handle = (req.params.handle as string).toLowerCase();

    const [auction] = await db
      .select()
      .from(handleAuctionsTable)
      .where(
        and(
          eq(handleAuctionsTable.handle, handle),
          eq(handleAuctionsTable.settled, false),
        ),
      )
      .limit(1);

    if (!auction) {
      throw new AppError(404, "NOT_FOUND", "No active auction found for this handle");
    }

    if (auction.endsAt < new Date()) {
      throw new AppError(410, "AUCTION_ENDED", "This auction has ended");
    }

    const parsed = auctionBidSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const stripe = getStripe();

    const { usersTable } = await import("@workspace/db/schema");
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.userId!),
      columns: { id: true, stripeCustomerId: true, email: true, displayName: true },
    });

    if (!user) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.displayName ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(usersTable.id, req.userId!));
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Handle Auction: @${handle}`,
              description: `Dutch auction bid for the @${handle} handle on Agent ID`,
            },
            unit_amount: auction.currentPrice,
          },
          quantity: 1,
        },
      ],
      success_url: parsed.data.successUrl,
      cancel_url: parsed.data.cancelUrl,
      metadata: {
        type: "handle_auction_bid",
        auctionId: auction.id,
        handle,
        userId: req.userId!,
        bidPrice: String(auction.currentPrice),
      },
    });

    await db
      .update(handleAuctionsTable)
      .set({
        winnerId: req.userId!,
        winnerStripeSessionId: session.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(handleAuctionsTable.id, auction.id),
          eq(handleAuctionsTable.settled, false),
        ),
      );

    res.json({
      url: session.url,
      handle,
      currentPrice: auction.currentPrice,
      currentPriceDollars: auction.currentPrice / 100,
      note: "Auction will be settled upon successful payment confirmation via webhook.",
    });
  } catch (err) {
    next(err);
  }
});

const mintChainSchema = z.object({
  chain: z.enum(["tron"]),
});

router.post("/:handle/mint-chain", requireAuth, async (req, res, next) => {
  try {
    const handle = req.params.handle as string;
    const userId = req.userId!;

    const multiChainEnabled = process.env.MULTI_CHAIN_ENABLED === "true";
    if (!multiChainEnabled) {
      res.status(501).json({
        error: "MULTI_CHAIN_NOT_ENABLED",
        message: "Multi-chain minting is not yet enabled",
      });
      return;
    }

    const parsed = mintChainSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues);
    }

    const { chain } = parsed.data;

    const agent = await db.query.agentsTable.findFirst({
      where: and(
        eq(agentsTable.handle, handle),
        agentOwnerFilter(userId),
      ),
      columns: {
        id: true,
        handle: true,
        handleTier: true,
        // chainMints tracks cross-chain mints (Tron, additional Base, etc.) — separate from
        // the identity-anchor canonical path (chainRegistrations). Intentionally retained here.
        chainMints: true,
        userId: true,
      },
    });

    if (!agent) {
      throw new AppError(404, "HANDLE_NOT_FOUND", `Handle "${handle}" not found or not owned by you`);
    }

    const tier = getHandleTier(handle);
    const is3or4Char = tier.tier === "premium_3" || tier.tier === "premium_4";
    if (!is3or4Char) {
      throw new AppError(400, "INVALID_HANDLE_TIER", "Only 3-char and 4-char handles can be minted on additional chains");
    }

    // chainMints is a deduplication guard for cross-chain mints (not the identity anchor canonical path).
    const existingMints = (agent.chainMints as Record<string, unknown>) ?? {};
    if (existingMints[chain]) {
      throw new AppError(409, "ALREADY_MINTED", `Handle "${handle}" has already been minted on ${chain}`);
    }

    if (chain === "tron") {
      const tronApiUrl = process.env.TRON_API_URL;
      const tronKey = process.env.TRON_MINTER_PRIVATE_KEY;
      const tronContract = process.env.TRON_CONTRACT_ADDRESS;
      const tronTopic = process.env.TRON_HANDLE_MINTED_TOPIC;
      const missing = [
        !tronApiUrl && "TRON_API_URL",
        !tronKey && "TRON_MINTER_PRIVATE_KEY",
        !tronContract && "TRON_CONTRACT_ADDRESS",
        !tronTopic && "TRON_HANDLE_MINTED_TOPIC",
      ].filter(Boolean);
      if (missing.length > 0) {
        throw new AppError(503, "TRON_NOT_CONFIGURED", `Tron minting is not configured: missing ${missing.join(", ")}`);
      }
    }

    const { mintHandleOnTron, updateChainMintsTron } = await import("../../services/chains/tron");

    logger.info({ handle, chain, agentId: agent.id }, "[handles] Starting chain mint");
    const mintResult = await mintHandleOnTron(handle);
    await updateChainMintsTron(agent.id, handle, mintResult);

    logger.info({ handle, chain, tokenId: mintResult.tokenId, txHash: mintResult.txHash }, "[handles] Chain mint complete");

    res.json({
      chain,
      tokenId: mintResult.tokenId,
      txHash: mintResult.txHash,
      contract: mintResult.contract,
      handle,
      agentId: agent.id,
    });
  } catch (err) {
    next(err);
  }
});

const claimNftSchema = z.object({
  userWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "userWallet must be a valid EVM address"),
  claimTicket: z.string().optional(),
});

/**
 * POST /handles/:handle/claim-nft
 *
 * Atomic registrar claim path:
 *   1. Validate claimTicket if provided (required for pending_anchor handles)
 *   2. If not yet anchored on-chain → registerOnChain()
 *   3. transferToUser() to the user's wallet
 *   4. Commit DB state only after all on-chain steps succeed
 */
router.post("/:handle/claim-nft", requireAuth, async (req, res, next) => {
  try {
    const handle = (req.params.handle as string).toLowerCase();
    const userId = req.userId!;

    const parsed = claimNftSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "userWallet must be a valid EVM address (0x...)", parsed.error.issues);
    }
    const { userWallet, claimTicket } = parsed.data;

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
        erc8004AgentId: true,
        erc8004Chain: true,
        // onChainTokenId is the ERC-8004 NFT tokenId stored at claim time — NOT a canonical
        // identity anchor key. Intentionally retained for NFT claim/status display.
        onChainTokenId: true,
        chainRegistrations: true,
        handleExpiresAt: true,
      },
    });

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Handle not found or you do not own this handle");
    }

    if (agent.nftCustodian === "user") {
      throw new AppError(400, "ALREADY_CLAIMED", "This handle NFT has already been claimed to a user wallet");
    }

    // Determine whether the handle is already anchored on-chain.
    const chainRegs = agent.chainRegistrations as Record<string, unknown> | unknown[] | null;
    const isAnchored = (() => {
      if (!chainRegs) return false;
      if (Array.isArray(chainRegs)) {
        // Accept both "base" (mainnet) and "base-sepolia" (testnet) chain labels
        return (chainRegs as Record<string, unknown>[]).some(
          e => e.chain === "base" || e.chain === "base-sepolia",
        );
      }
      return !!(chainRegs as Record<string, unknown>).base;
    })();

    // Reject if not eligible to claim: must have platform custody or be in pending_anchor state.
    const eligible =
      agent.nftCustodian === "platform" ||
      agent.nftStatus === "pending_anchor" ||
      isAnchored;

    if (!eligible) {
      throw new AppError(400, "NOT_ELIGIBLE", `Handle is not eligible for NFT claim. nftStatus=${agent.nftStatus}, custodian=${agent.nftCustodian ?? "none"}`);
    }

    // Claim tickets are required for all registrar-path claims on this endpoint.
    // This provides signed replay-safe binding between agentId, handle, and optionally wallet.
    // (Direct admin transfers use POST /handles/:handle/transfer instead.)
    if (!claimTicket) {
      throw new AppError(400, "CLAIM_TICKET_REQUIRED", "A signed claim ticket is required. Obtain one by calling POST /api/v1/handles/:handle/request-mint first.");
    }

    // Verify claim ticket without consuming it yet.
    // The JTI is consumed ONLY after all on-chain steps and DB commit succeed,
    // so a failed registerOnChain/transferToUser does not strand the user's ticket.
    const { verifyClaimTicket, consumeClaimTicketJti } = await import("../../services/claim-ticket");
    const ticketResult = await verifyClaimTicket(claimTicket, {
      wallet: userWallet,
      expectedHandle: handle,
      expectedAgentId: agent.id,
    });
    if (!ticketResult.ok) {
      throw new AppError(400, "INVALID_CLAIM_TICKET", ticketResult.error);
    }
    const ticketPayload = ticketResult.payload;
    const ticketAgentId = ticketPayload.sub;
    logger.info({ handle, agentId: ticketAgentId, userWallet }, "[handles] claim-nft: claim ticket verified (not yet consumed)");

    const { registerOnChain, transferToUser: transferToUserFn, isOnchainMintingEnabled } = await import("../../services/chains/base");
    const { nftAuditLogTable } = await import("@workspace/db/schema");

    // Fail-closed: if on-chain minting is not enabled, the endpoint is not available
    // for unanchored handles. Claims on already-anchored handles still require the
    // transferToUser on-chain call, so minting must also be enabled for those.
    // This prevents DB/on-chain state divergence.
    if (!isOnchainMintingEnabled()) {
      throw new AppError(503, "ONCHAIN_REQUIRED", "On-chain minting is not enabled on this server. Enable ONCHAIN_MINTING_ENABLED to allow handle NFT claims.");
    }

    let txHashRegister: string | undefined;
    let txHashTransfer: string | undefined;
    let onchainAgentId: string | undefined;
    let onchainContractAddress: string | undefined;

    {
      // Step 1: Register on-chain if not yet anchored.
      if (!isAnchored) {
        // Idempotency: check if handle is already registered on-chain (e.g. partial retry).
        // If so, use the existing registration rather than re-registering (which would revert).
        const { resolveOnChain, getContractAddress } = await import("../../services/chains/base");
        let existingOnchain: Awaited<ReturnType<typeof resolveOnChain>> | null = null;
        try {
          existingOnchain = await resolveOnChain(handle);
        } catch {
          // resolveOnChain failure is non-fatal at this point — proceed to register
        }

        if (existingOnchain && existingOnchain.agentId && existingOnchain.active) {
          // Already registered on-chain (partial failure recovery path)
          onchainAgentId = existingOnchain.agentId;
          onchainContractAddress = (await getContractAddress()) ?? undefined;
          logger.info({ handle, agentId: agent.id, erc8004AgentId: onchainAgentId }, "[handles] claim-nft: handle already registered on-chain — skipping re-register (idempotent retry)");
        } else {
          const { getHandleTier } = await import("../../services/handle");
          const tierInfo = getHandleTier(handle);
          const expiresAt = agent.handleExpiresAt ?? (() => {
            const d = new Date();
            d.setFullYear(d.getFullYear() + 1);
            return d;
          })();

          try {
            const onchainResult = await registerOnChain(handle, tierInfo.tier, new Date(expiresAt));
            if (!onchainResult) {
              // Registrar returned null — chain config incomplete or contract misconfigured.
              throw new Error("registerOnChain returned null — chain adapter not configured or contract address missing");
            }
            txHashRegister = onchainResult.txHash;
            onchainAgentId = onchainResult.agentId;
            onchainContractAddress = onchainResult.contractAddress;

            logger.info({ handle, agentId: agent.id, erc8004AgentId: onchainAgentId, txHash: txHashRegister }, "[handles] claim-nft: registerOnChain succeeded");
          } catch (regErr) {
            const errMsg = regErr instanceof Error ? regErr.message : String(regErr);
            logger.error({ agentId: agent.id, handle, error: errMsg }, "[handles] claim-nft: registerOnChain failed");
            throw new AppError(500, "REGISTER_FAILED", `On-chain registration failed: ${errMsg}`);
          }
        }
      } else {
        onchainAgentId = agent.erc8004AgentId ?? undefined;
      }

      // Step 2: Transfer custody to user wallet.
      // Null return means chain adapter not configured — treat as hard failure.
      try {
        const result = await transferToUserFn(handle, userWallet);
        if (!result) {
          throw new Error("transferToUser returned null — chain adapter not configured or contract address missing");
        }
        txHashTransfer = result.txHash;
      } catch (chainErr) {
        const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);
        logger.error({ agentId: agent.id, handle, userWallet, error: errMsg }, "[handles] claim-nft: transferToUser failed");
        throw new AppError(500, "TRANSFER_FAILED", `On-chain transfer failed: ${errMsg}`);
      }
    }

    // Step 3: Commit DB state only after all on-chain steps succeeded.
    // For newly-anchored handles (not previously anchored): write a fresh chainRegistrations array.
    // For already-anchored handles (isAnchored=true): update the matching entry's custodian to "user".
    let chainRegistrationsUpdate: Record<string, unknown>[] | undefined;
    if (!isAnchored && onchainAgentId) {
      chainRegistrationsUpdate = [
        {
          chain: "base",
          agentId: onchainAgentId,
          txHash: txHashRegister ?? null,
          contractAddress: onchainContractAddress ?? null,
          registeredAt: new Date().toISOString(),
          custodian: "user",
        },
      ];
    } else if (isAnchored) {
      // Update the existing chainRegistrations entries to set custodian="user"
      const existingRegs = (agent.chainRegistrations as Record<string, unknown>[] | null) ?? [];
      const normalizedRegs: Record<string, unknown>[] = Array.isArray(existingRegs)
        ? existingRegs
        : Object.entries(existingRegs as Record<string, unknown>).map(([chain, v]) => ({ ...(v as Record<string, unknown>), chain }));
      chainRegistrationsUpdate = normalizedRegs.map((entry) =>
        (entry.chain === "base" || entry.chain === "base-sepolia")
          ? { ...entry, custodian: "user" }
          : entry,
      );
    }

    await db.update(agentsTable)
      .set({
        nftStatus: "active",
        nftCustodian: "user",
        nftOwnerWallet: userWallet.toLowerCase(),
        onChainOwner: userWallet.toLowerCase(),
        ...(onchainAgentId ? { erc8004AgentId: onchainAgentId } : {}),
        ...(chainRegistrationsUpdate ? { chainRegistrations: chainRegistrationsUpdate } : {}),
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    await db.insert(nftAuditLogTable).values({
      agentId: agent.id,
      handle,
      action: "claim",
      chain: "base",
      txHash: txHashTransfer ?? txHashRegister ?? null,
      toAddress: userWallet.toLowerCase(),
      custodian: "user",
      status: "success",
      metadata: {
        userWallet,
        erc8004AgentId: onchainAgentId ?? agent.erc8004AgentId ?? null,
        claimTicketUsed: !!claimTicket,
        ticketAgentId: ticketAgentId ?? null,
        registerTxHash: txHashRegister ?? null,
      },
    });

    // Step 4: All on-chain steps and DB commit succeeded — now consume the JTI.
    // This is deferred so a failed registerOnChain/transferToUser leaves the ticket usable for retry.
    const consumeOk = await consumeClaimTicketJti(ticketPayload);
    if (!consumeOk) {
      // A concurrent request consumed the JTI between our verify and here.
      // This is extremely rare but the DB is already committed, so log and continue.
      logger.warn({ handle, agentId: agent.id, jti: ticketPayload.jti }, "[handles] claim-nft: JTI consumed by concurrent request after DB commit — claim still valid");
    }

    logger.info(
      { agentId: agent.id, handle, userWallet, txHashRegister, txHashTransfer, claimTicketUsed: !!claimTicket },
      "[handles] claim-nft: NFT claimed to user wallet",
    );

    res.json({
      handle,
      status: "claimed",
      nftCustodian: "user",
      nftOwnerWallet: userWallet.toLowerCase(),
      ...(txHashTransfer ? { txHash: txHashTransfer } : {}),
      ...(txHashRegister ? { registerTxHash: txHashRegister } : {}),
      message: `Handle NFT for @${handle} has been transferred to your wallet.`,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:handle/request-mint", requireAuth, async (req, res, next) => {
  try {
    const onchainMintingEnabled = process.env.ONCHAIN_MINTING_ENABLED === "true" || process.env.ONCHAIN_MINTING_ENABLED === "1";
    if (!onchainMintingEnabled) {
      throw new AppError(503, "ONCHAIN_MINTING_DISABLED", "On-chain minting is not currently enabled");
    }

    const handle = (req.params.handle as string).toLowerCase();
    const validationError = validateHandle(handle);
    if (validationError) {
      throw new AppError(400, "INVALID_HANDLE", validationError);
    }

    const agent = await db.query.agentsTable.findFirst({
      where: and(
        eq(agentsTable.handle, handle),
        agentOwnerFilter(req.userId!),
      ),
      columns: { id: true, handle: true, nftStatus: true, handleTier: true, userId: true, metadata: true },
    });

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Handle not found or you do not own this handle");
    }

    if (agent.nftStatus === "active" || agent.nftStatus === "minted") {
      throw new AppError(409, "ALREADY_MINTED", "This handle has already been anchored on-chain");
    }

    if (agent.nftStatus === "pending_mint") {
      throw new AppError(409, "MINT_PENDING", "This handle already has a pending anchor request");
    }

    // If already in pending_anchor, reissue a claim ticket so the user can retry claim-nft.
    if (agent.nftStatus === "pending_anchor") {
      const { issueClaimTicket } = await import("../../services/claim-ticket");
      const retryClaimTicket = issueClaimTicket({ agentId: agent.id, handle }) ?? null;
      logger.info({ agentId: agent.id, handle }, "[handles] request-mint: Reissuing claim ticket for pending_anchor handle");
      res.json({
        handle,
        requiresPayment: false,
        nftStatus: "pending_anchor",
        ...(retryClaimTicket ? { claimTicket: retryClaimTicket } : {}),
        message: "Your handle is already queued for on-chain anchoring. Use the returned claimTicket with /claim-nft to transfer custody to your wallet.",
      });
      return;
    }

    // Issue a claim ticket so the user can later call /claim-nft with their wallet.
    let claimTicket: string | null = null;
    try {
      const { issueClaimTicket } = await import("../../services/claim-ticket");
      claimTicket = issueClaimTicket({ agentId: agent.id, handle }) ?? null;
    } catch {
      // Non-fatal: proceed without ticket
    }

    await db
      .update(agentsTable)
      .set({
        nftStatus: "pending_anchor",
        nftCustodian: "platform",
        metadata: sql`jsonb_set(COALESCE(${agentsTable.metadata}::jsonb, '{}'::jsonb), '{pendingClaimTicket}', ${JSON.stringify(claimTicket)}::jsonb, true)`,
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    const { nftAuditLogTable } = await import("@workspace/db/schema");
    await db.insert(nftAuditLogTable).values({
      agentId: agent.id,
      handle,
      action: "queue_mint",
      chain: "base",
      status: "success",
      metadata: { source: "request-mint", tier: agent.handleTier, includesOnChainMint: true, claimTicketIssued: !!claimTicket },
    });

    logger.info({ agentId: agent.id, handle, claimTicketIssued: !!claimTicket }, "[handles] request-mint: Queued paid handle for on-chain anchoring");

    res.json({
      handle,
      requiresPayment: false,
      nftStatus: "pending_anchor",
      ...(claimTicket ? { claimTicket } : {}),
      message: "Your handle has been queued for on-chain anchoring. Use the returned claimTicket with /claim-nft to transfer custody to your wallet.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
