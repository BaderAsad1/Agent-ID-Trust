import { Router } from "express";
import { z } from "zod/v4";
import { eq, and } from "drizzle-orm";
import { AppError } from "../../middlewares/error-handler";
import { validateHandle, isHandleAvailable, getHandleReservation, isHandleReserved } from "../../services/agents";
import { getHandlePricing, HANDLE_PRICING_TIERS } from "../../services/handle-pricing";
import { requireAuth } from "../../middlewares/replit-auth";
import { db } from "@workspace/db";
import { agentsTable, handleAuctionsTable, handleTrademarkClaimsTable } from "@workspace/db/schema";
import { getStripe } from "../../services/stripe-client";
import { logger } from "../../middlewares/request-logger";

const router = Router();

const checkHandleSchema = z.object({
  handle: z.string().min(1).max(100),
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
      const pricing = getHandlePricing(normalized);
      res.json({
        available: false,
        handle: normalized,
        status: "reserved",
        reserved: true,
        reservedReason: reservation.reservedReason,
        pricing: {
          tier: pricing.tier,
          annualPriceUsd: pricing.annualPriceUsd,
          annualPriceCents: pricing.annualPriceCents,
          description: pricing.description,
        },
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

    const pricing = getHandlePricing(normalized);

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
      pricing: {
        tier: pricing.tier,
        annualPriceUsd: pricing.annualPriceUsd,
        annualPriceCents: pricing.annualPriceCents,
        description: pricing.description,
      },
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

export default router;
