import { Router } from "express";
import { z } from "zod/v4";
import { eq, and } from "drizzle-orm";
import { AppError } from "../../middlewares/error-handler";
import { validateHandle, isHandleAvailable, getHandleReservation, isHandleReserved } from "../../services/agents";
import { getHandleTier, isHandleReserved as isHandleTierReserved } from "../../services/handle";

function legacyPricingShape(tier: ReturnType<typeof getHandleTier>) {
  return {
    tier: tier.tier,
    annualPriceUsd: tier.annualUsd,
    annualPriceCents: tier.annualCents,
    description: `${tier.tier === "premium_3" ? "Ultra-premium 3-char (ENS pricing)" : tier.tier === "premium_4" ? "Premium 4-char (ENS pricing)" : "Standard 5+ char handle"}`,
  };
}

const HANDLE_PRICING_TIERS = [
  { minLength: 3, maxLength: 3, tier: "premium_3", annualPriceUsd: 640, annualPriceCents: 64000, description: "Ultra-premium 3-char (ENS pricing)" },
  { minLength: 4, maxLength: 4, tier: "premium_4", annualPriceUsd: 160, annualPriceCents: 16000, description: "Premium 4-char (ENS pricing)" },
  { minLength: 5, maxLength: undefined, tier: "standard_5plus", annualPriceUsd: 5, annualPriceCents: 500, description: "Standard 5+ char handle" },
];
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
      const pricing = legacyPricingShape(getHandleTier(normalized));
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

    const pricing = legacyPricingShape(getHandleTier(normalized));

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

    res.json({
      available: true,
      handle: normalized,
      status: "available",
      tier: pricing.tier,
      annual: pricing.annualPriceCents,
      annualUsd: pricing.annualPriceUsd,
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
  paymentIntentId: z.string().optional(),
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

    const { chain, paymentIntentId: submittedPaymentIntentId } = parsed.data;

    const agent = await db.query.agentsTable.findFirst({
      where: and(
        eq(agentsTable.handle, handle),
        eq(agentsTable.userId, userId),
      ),
      columns: {
        id: true,
        handle: true,
        handleTier: true,
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

    const { getUserPlan } = await import("../../services/billing");
    const plan = await getUserPlan(userId);
    const isStarterPlan = plan === "none" || plan === "starter";

    if (isStarterPlan) {
      const stripe = getStripe();

      if (submittedPaymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(submittedPaymentIntentId);

        if (pi.metadata?.type !== "chain_mint" || pi.metadata?.handle !== handle || pi.metadata?.chain !== chain || pi.metadata?.userId !== userId) {
          throw new AppError(400, "INVALID_PAYMENT_INTENT", "Payment intent does not match this chain mint request");
        }

        if (pi.status !== "succeeded" && pi.status !== "requires_capture") {
          throw new AppError(402, "PAYMENT_NOT_COMPLETE", `Payment intent is not in a completed state (status: ${pi.status}). Complete payment before minting.`);
        }

        logger.info({ handle, chain, paymentIntentId: submittedPaymentIntentId, plan }, "[handles] Payment verified for Starter chain mint, proceeding");
      } else {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 500,
          currency: "usd",
          metadata: {
            type: "chain_mint",
            handle,
            chain,
            userId,
            agentId: agent.id,
          },
          description: `Chain mint for ${handle} on ${chain}`,
        });

        logger.info({ handle, chain, paymentIntentId: paymentIntent.id, plan }, "[handles] Created Stripe PaymentIntent for Starter chain mint");

        res.status(402).json({
          paymentRequired: true,
          amount: 500,
          currency: "usd",
          paymentIntentId: paymentIntent.id,
          message: `A $5 charge is required to mint "${handle}" on ${chain} for Starter plan users.`,
          hint: "Complete payment using the paymentIntentId, then retry this request with { chain, paymentIntentId } to complete minting.",
        });
        return;
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
});

router.post("/:handle/claim-nft", requireAuth, async (req, res, next) => {
  try {
    const handle = (req.params.handle as string).toLowerCase();
    const userId = req.userId!;

    const parsed = claimNftSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "userWallet must be a valid EVM address (0x...)", parsed.error.issues);
    }
    const { userWallet } = parsed.data;

    const agent = await db.query.agentsTable.findFirst({
      where: and(
        eq(agentsTable.handle, handle),
        eq(agentsTable.userId, userId),
      ),
      columns: {
        id: true,
        handle: true,
        userId: true,
        nftStatus: true,
        nftCustodian: true,
        erc8004AgentId: true,
        onChainTokenId: true,
      },
    });

    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Handle not found or you do not own this handle");
    }

    if (agent.nftCustodian !== "platform") {
      throw new AppError(400, "NOT_IN_PLATFORM_CUSTODY", `NFT is not in platform custody. Current custodian: ${agent.nftCustodian ?? "none"}`);
    }

    const { transferToUser: transferToUserFn, isOnchainMintingEnabled } = await import("../../services/chains/base");

    let txHash: string | undefined;

    if (isOnchainMintingEnabled()) {
      try {
        const result = await transferToUserFn(handle, userWallet);
        if (result) {
          txHash = result.txHash;
        }
      } catch (chainErr) {
        const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);
        logger.error({ agentId: agent.id, handle, userWallet, error: errMsg }, "[handles] claim-nft: transferToUser failed");
        throw new AppError(500, "TRANSFER_FAILED", `On-chain transfer failed: ${errMsg}`);
      }
    }

    const { nftAuditLogTable } = await import("@workspace/db/schema");

    await db.update(agentsTable)
      .set({
        nftCustodian: "user",
        nftOwnerWallet: userWallet.toLowerCase(),
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    await db.insert(nftAuditLogTable).values({
      agentId: agent.id,
      handle,
      action: "claim",
      chain: "base",
      txHash: txHash ?? null,
      toAddress: userWallet.toLowerCase(),
      custodian: "user",
      status: "success",
      metadata: { userWallet, erc8004AgentId: agent.erc8004AgentId ?? null },
    });

    logger.info({ agentId: agent.id, handle, userWallet, txHash }, "[handles] claim-nft: NFT claimed to user wallet");

    res.json({
      handle,
      status: "claimed",
      nftCustodian: "user",
      nftOwnerWallet: userWallet.toLowerCase(),
      ...(txHash ? { txHash } : {}),
      message: `Handle NFT for @${handle} has been transferred to your wallet.`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
