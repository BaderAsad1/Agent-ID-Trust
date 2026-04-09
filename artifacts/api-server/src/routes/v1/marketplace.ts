import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import {
  createListing,
  updateListing,
  deleteListing,
  getListingById,
  listListings,
  getMyListings,
  incrementListingViews,
} from "../../services/marketplace";
import {
  createOrder,
  confirmPayment,
  confirmOrder,
  completeOrder,
  cancelOrder,
  getOrderById,
  listOrders,
} from "../../services/orders";
import {
  createReview,
  getReviewsByListing,
} from "../../services/reviews";
import {
  createMilestones,
  getMilestonesByOrder,
  markMilestoneComplete,
  releaseMilestoneEscrow,
  raiseMilestoneDispute,
} from "../../services/marketplace-milestones";
import { trackAnalyticsEvent, getListingAnalytics } from "../../services/marketplace-analytics";
import { env } from "../../lib/env";
import { db } from "@workspace/db";
import { and, asc, eq, desc } from "drizzle-orm";
import {
  marketplaceMilestonesTable,
  marketplaceOrderMessagesTable,
  a2aServiceListingsTable,
  a2aEngagementsTable,
  agentsTable,
} from "@workspace/db/schema";

const router = Router();

const PAYOUT_NOTE = "Seller payout requires manual settlement. Stripe Connect automated payouts are not yet implemented. Funds are held and will be disbursed manually by the platform operator.";

function withPayoutDisclosure<T extends object>(order: T): T & { payoutStatus: string; payoutNote: string } {
  return {
    ...order,
    payoutStatus: "pending_manual",
    payoutNote: PAYOUT_NOTE,
  };
}

async function getParticipantOrderOrThrow(orderId: string, userId: string) {
  const order = await getOrderById(orderId, userId);
  if (!order) {
    throw new AppError(404, "NOT_FOUND", "Order not found");
  }
  return order;
}

function getSenderRoleForOrder(
  order: { buyerUserId: string; sellerUserId: string },
  userId: string,
): "buyer" | "seller" {
  return order.buyerUserId === userId ? "buyer" : "seller";
}

const listingPackageSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  deliverables: z.array(z.string()).optional(),
  priceUsdc: z.string(),
  deliveryDays: z.number().int().positive(),
});

const createListingSchema = z.object({
  agentId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  pitch: z.string().optional(),
  priceType: z.enum(["fixed", "hourly", "per_task", "custom"]).optional(),
  priceAmount: z.string().optional(),
  deliveryHours: z.number().int().positive().optional(),
  capabilities: z.array(z.string()).optional(),
  listingMode: z.enum(["h2a", "a2a", "both"]).optional(),
  packages: z.array(listingPackageSchema).max(3).optional(),
});

const updateListingSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  pitch: z.string().optional(),
  priceType: z.enum(["fixed", "hourly", "per_task", "custom"]).optional(),
  priceAmount: z.string().optional(),
  deliveryHours: z.number().int().positive().optional(),
  capabilities: z.array(z.string()).optional(),
  status: z.enum(["draft", "active", "paused", "closed"]).optional(),
  listingMode: z.enum(["h2a", "a2a", "both"]).optional(),
  packages: z.array(listingPackageSchema).max(3).optional(),
});

const listingsQuerySchema = z.object({
  category: z.string().max(100).optional(),
  status: z.enum(["draft", "active", "paused", "closed"]).optional(),
  agentId: z.string().uuid().optional(),
  featured: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  search: z.string().max(200).optional(),
  limit: z.string().pipe(z.coerce.number().int().positive().max(100)).default("20"),
  offset: z.string().pipe(z.coerce.number().int().nonnegative().max(10000)).default("0"),
  sortBy: z.enum(["created", "rating", "hires", "price"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  listingMode: z.enum(["h2a", "a2a", "both"]).optional(),
});

router.get("/listings", async (req, res, next) => {
  try {
    const parsed = listingsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters", parsed.error.issues);
    }
    const result = await listListings(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/listings/mine", requireAuth, async (req, res, next) => {
  try {
    const listings = await getMyListings(req.userId!);
    res.json({ listings });
  } catch (err) {
    next(err);
  }
});

router.get("/listings/:listingId", validateUuidParam("listingId"), async (req, res, next) => {
  try {
    const listingId = req.params.listingId as string;
    const listing = await getListingById(listingId);
    if (!listing) throw new AppError(404, "NOT_FOUND", "Listing not found");
    await Promise.all([
      incrementListingViews(listingId),
      trackAnalyticsEvent({ eventType: "listing_view", listingId }),
    ]);
    res.json(listing);
  } catch (err) {
    next(err);
  }
});

router.get("/listings/:listingId/analytics", requireAuth, validateUuidParam("listingId"), async (req, res, next) => {
  try {
    const listingId = req.params.listingId as string;
    const listing = await getListingById(listingId);
    if (!listing) throw new AppError(404, "NOT_FOUND", "Listing not found");
    if (listing.userId !== req.userId!) {
      throw new AppError(403, "FORBIDDEN", "Only listing owner can view analytics");
    }
    const analytics = await getListingAnalytics(listingId);
    res.json({ listingId, ...analytics });
  } catch (err) {
    next(err);
  }
});

router.post("/listings", requireAuth, async (req, res, next) => {
  try {
    const parsed = createListingSchema.parse(req.body);
    const result = await createListing({ ...parsed, userId: req.userId! });
    if (!result.success) {
      const code = result.error === "AGENT_NOT_FOUND" ? 404
        : result.error === "AGENT_NOT_ACTIVE" || result.error === "AGENT_NOT_VERIFIED" ? 403
        : result.error?.startsWith("PLAN_UPGRADE_REQUIRED") ? 402 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.status(201).json(result.listing);
  } catch (err) {
    next(err);
  }
});

router.put("/listings/:listingId", requireAuth, validateUuidParam("listingId"), async (req, res, next) => {
  try {
    const listingId = req.params.listingId as string;
    const parsed = createListingSchema.omit({ agentId: true }).parse(req.body);
    const result = await updateListing(listingId, req.userId!, parsed);
    if (!result.success) {
      const code = result.error === "LISTING_NOT_FOUND" ? 404 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.listing);
  } catch (err) {
    next(err);
  }
});

router.patch("/listings/:listingId", requireAuth, validateUuidParam("listingId"), async (req, res, next) => {
  try {
    const listingId = req.params.listingId as string;
    const parsed = updateListingSchema.parse(req.body);
    const result = await updateListing(listingId, req.userId!, parsed);
    if (!result.success) {
      const code = result.error === "LISTING_NOT_FOUND" ? 404 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.listing);
  } catch (err) {
    next(err);
  }
});

router.delete("/listings/:listingId", requireAuth, validateUuidParam("listingId"), async (req, res, next) => {
  try {
    const listingId = req.params.listingId as string;
    const result = await deleteListing(listingId, req.userId!);
    if (!result.success) {
      throw new AppError(404, "NOT_FOUND", "Listing not found");
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/listings/:listingId/reviews", validateUuidParam("listingId"), async (req, res, next) => {
  try {
    const listingId = req.params.listingId as string;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const result = await getReviewsByListing(listingId, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/stripe-config", (_req, res) => {
  const publishableKey = env().STRIPE_PUBLISHABLE_KEY || "";
  res.json({ publishableKey });
});

const createMilestoneSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  amount: z.string(),
  dueAt: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const createOrderSchema = z.object({
  listingId: z.string().uuid(),
  taskDescription: z.string().optional(),
  selectedPackage: z.string().optional(),
  milestones: z.array(createMilestoneSchema).optional(),
});

const orderMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

router.post("/orders", requireAuth, async (req, res, next) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid request");
    }
    const result = await createOrder({
      listingId: parsed.data.listingId,
      buyerUserId: req.userId!,
      taskDescription: parsed.data.taskDescription,
      selectedPackage: parsed.data.selectedPackage,
    });
    if (!result.success) {
      const statusMap: Record<string, number> = {
        LISTING_NOT_FOUND: 404,
        CANNOT_ORDER_OWN_LISTING: 403,
        PACKAGE_NOT_FOUND: 400,
        PAYMENT_INTENT_FAILED: 502,
      };
      const status = statusMap[result.error ?? ""] ?? 400;
      throw new AppError(status, result.error ?? "ORDER_FAILED", result.error ?? "Failed to create order");
    }
    res.status(201).json({ ...withPayoutDisclosure(result.order!), clientSecret: result.clientSecret });
  } catch (err) {
    next(err);
  }
});

router.get("/orders", requireAuth, async (req, res, next) => {
  try {
    const role = (req.query.role as "buyer" | "seller" | "all") ?? "all";
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const result = await listOrders(req.userId!, role, limit, offset);
    res.json({
      orders: result.orders.map(withPayoutDisclosure),
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:orderId", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const order = await getOrderById(orderId, req.userId!);
    if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
    res.json(withPayoutDisclosure(order));
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:orderId/messages", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    await getParticipantOrderOrThrow(orderId, req.userId!);

    const messages = await db
      .select()
      .from(marketplaceOrderMessagesTable)
      .where(eq(marketplaceOrderMessagesTable.orderId, orderId))
      .orderBy(asc(marketplaceOrderMessagesTable.createdAt));

    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/messages", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const order = await getParticipantOrderOrThrow(orderId, req.userId!);
    const body = orderMessageSchema.parse(req.body);

    if (order.status === "cancelled" || order.status === "payment_failed") {
      throw new AppError(409, "ORDER_NOT_MESSAGEABLE", "Messages are disabled for cancelled or failed-payment orders");
    }

    const [message] = await db
      .insert(marketplaceOrderMessagesTable)
      .values({
        orderId,
        senderRole: getSenderRoleForOrder(order, req.userId!),
        senderUserId: req.userId!,
        body: body.body,
      })
      .returning();

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/confirm-payment", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const result = await confirmPayment(orderId, req.userId!);
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(withPayoutDisclosure(result.order!));
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/confirm", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const result = await confirmOrder(orderId, req.userId!);
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(withPayoutDisclosure(result.order!));
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/complete", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const result = await completeOrder(orderId, req.userId!);
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }

    const order = result.order!;
    await trackAnalyticsEvent({
      eventType: "hire_completed",
      listingId: order.listingId,
      userId: req.userId!,
    });

    res.json({
      ...result.order,
      payoutStatus: result.payoutStatus,
      payoutNote: result.payoutNote,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/cancel", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const result = await cancelOrder(orderId, req.userId!);
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    const order = result.order!;
    await trackAnalyticsEvent({
      eventType: "hire_cancelled",
      listingId: order.listingId,
      userId: req.userId!,
    });
    res.json(withPayoutDisclosure(order));
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:orderId/milestones", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const order = await getOrderById(orderId, req.userId!);
    if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
    const milestones = await getMilestonesByOrder(orderId);
    res.json({ milestones });
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/milestones", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const order = await getOrderById(orderId, req.userId!);
    if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");

    if (order.buyerUserId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "Only the buyer can add milestones to an order");
    }

    const schema = z.array(createMilestoneSchema).min(1);
    const parsed = schema.parse(req.body.milestones ?? req.body);
    const results = await createMilestones(
      orderId,
      parsed.map((m) => ({
        ...m,
        dueAt: m.dueAt ? new Date(m.dueAt) : undefined,
      })),
    );
    res.status(201).json({
      milestones: results.map((r) => r.milestone),
      milestoneClientSecrets: results.map((r) => ({
        milestoneId: r.milestone.id,
        title: r.milestone.title,
        amount: r.milestone.amount,
        clientSecret: r.clientSecret,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/orders/:orderId/release-milestone",
  requireAuth,
  validateUuidParam("orderId"),
  async (req, res, next) => {
    try {
      const orderId = req.params.orderId as string;
      const { milestoneId } = z.object({ milestoneId: z.string().uuid() }).parse(req.body);

      const milestone = await db.query.marketplaceMilestonesTable.findFirst({
        where: and(
          eq(marketplaceMilestonesTable.id, milestoneId),
          eq(marketplaceMilestonesTable.orderId, orderId),
        ),
        columns: { id: true },
      });
      if (!milestone) throw new AppError(404, "MILESTONE_NOT_FOUND", "Milestone does not belong to this order");

      const result = await releaseMilestoneEscrow(milestoneId, req.userId!);
      if (!result.success) {
        const code = result.error === "MILESTONE_NOT_FOUND" || result.error === "ORDER_NOT_FOUND" ? 404
          : result.error === "FORBIDDEN" ? 403
          : 409;
        throw new AppError(code, result.error!, result.error!);
      }
      res.json(result.milestone);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/orders/:orderId/milestones/:milestoneId/complete",
  requireAuth,
  validateUuidParam("orderId", "milestoneId"),
  async (req, res, next) => {
    try {
      const { orderId, milestoneId } = req.params;

      const milestoneOwnership = await db.query.marketplaceMilestonesTable.findFirst({
        where: and(
          eq(marketplaceMilestonesTable.id, milestoneId as string),
          eq(marketplaceMilestonesTable.orderId, orderId as string),
        ),
        columns: { id: true },
      });
      if (!milestoneOwnership) throw new AppError(404, "MILESTONE_NOT_FOUND", "Milestone does not belong to this order");

      const result = await markMilestoneComplete(milestoneId as string, req.userId!);
      if (!result.success) {
        const code = result.error === "MILESTONE_NOT_FOUND" || result.error === "ORDER_NOT_FOUND" ? 404
          : result.error === "FORBIDDEN" ? 403
          : 409;
        throw new AppError(code, result.error!, result.error!);
      }
      res.json(result.milestone);
    } catch (err) {
      next(err);
    }
  },
);

const disputeSchema = z.object({
  reason: z.string().min(1).max(255),
  description: z.string().optional(),
});

router.post("/orders/:orderId/dispute", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const parsed = disputeSchema.parse(req.body);
    const result = await raiseMilestoneDispute(orderId, req.userId!, parsed.reason, parsed.description);
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404
        : result.error === "FORBIDDEN" ? 403
        : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json({ success: true, orderId, status: "disputed" });
  } catch (err) {
    next(err);
  }
});

const createReviewSchema = z.object({
  orderId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

router.post("/reviews", requireAuth, async (req, res, next) => {
  try {
    const parsed = createReviewSchema.parse(req.body);
    const result = await createReview({
      ...parsed,
      reviewerId: req.userId!,
    });
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404
        : result.error === "REVIEW_ALREADY_EXISTS" ? 409
        : result.error === "ORDER_NOT_COMPLETED" ? 403 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.status(201).json(result.review);
  } catch (err) {
    next(err);
  }
});

// ─── A2A Registry ────────────────────────────────────────────────────────────

router.get("/a2a/registry", async (req, res, next) => {
  try {
    const capabilityType = req.query.capabilityType as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const services = await db
      .select({
        id: a2aServiceListingsTable.id,
        agentId: a2aServiceListingsTable.agentId,
        name: a2aServiceListingsTable.name,
        description: a2aServiceListingsTable.description,
        capabilityType: a2aServiceListingsTable.capabilityType,
        capabilitySchema: a2aServiceListingsTable.capabilitySchema,
        pricingModel: a2aServiceListingsTable.pricingModel,
        pricePerCallUsdc: a2aServiceListingsTable.pricePerCallUsdc,
        pricePerTokenUsdc: a2aServiceListingsTable.pricePerTokenUsdc,
        pricePerSecondUsdc: a2aServiceListingsTable.pricePerSecondUsdc,
        latencySlaMs: a2aServiceListingsTable.latencySlaMs,
        totalCalls: a2aServiceListingsTable.totalCalls,
        successRate: a2aServiceListingsTable.successRate,
        tags: a2aServiceListingsTable.tags,
        agentHandle: agentsTable.handle,
        createdAt: a2aServiceListingsTable.createdAt,
      })
      .from(a2aServiceListingsTable)
      .innerJoin(agentsTable, eq(a2aServiceListingsTable.agentId, agentsTable.id))
      .where(
        and(
          eq(a2aServiceListingsTable.status, "active"),
          capabilityType ? eq(a2aServiceListingsTable.capabilityType, capabilityType) : undefined,
        ),
      )
      .orderBy(desc(a2aServiceListingsTable.totalCalls))
      .limit(limit)
      .offset(offset);

    const mapped = services
      .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.description || "").toLowerCase().includes(search.toLowerCase()))
      .map((s) => {
        const schema = s.capabilitySchema as { sampleInput?: object; sampleOutput?: object; inputTypes?: string[]; outputTypes?: string[] } | null;
        const price = s.pricePerCallUsdc ?? s.pricePerTokenUsdc ?? s.pricePerSecondUsdc ?? "0.01";
        return {
          id: s.id,
          agentId: s.agentId,
          name: s.name,
          handle: s.agentHandle,
          description: s.description || "",
          capabilityType: s.capabilityType,
          capabilities: schema?.inputTypes ?? [],
          pricing: {
            model: s.pricingModel as "per_call" | "per_token" | "per_second",
            amount: price,
            currency: "USDC" as const,
          },
          latencySla: s.latencySlaMs ? `${s.latencySlaMs}ms` : "< 2s",
          availability: "99.9%",
          callSchema: {
            input: schema?.inputTypes?.join(" | ") ?? "object",
            output: schema?.outputTypes?.join(" | ") ?? "object",
          },
          exampleRequest: schema?.sampleInput ?? {},
          exampleResponse: schema?.sampleOutput ?? {},
          totalCalls: s.totalCalls,
          successRate: s.successRate ? parseFloat(String(s.successRate)) : 99.5,
          tags: (s.tags as string[]) ?? [],
          createdAt: s.createdAt,
        };
      });

    res.json({ services: mapped, total: mapped.length, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ─── A2A Engagements ─────────────────────────────────────────────────────────

const createEngagementSchema = z.object({
  agentId: z.string().uuid(),
  serviceHandle: z.string().min(1),
  serviceName: z.string().min(1),
  spendingCapUsdc: z.string().default("10"),
  paymentModel: z.string().default("per_call"),
  pricePerUnit: z.string().default("0.01"),
  currency: z.string().default("USDC"),
});

router.get("/a2a/engagements", requireAuth, async (req, res, next) => {
  try {
    const engagements = await db
      .select()
      .from(a2aEngagementsTable)
      .where(eq(a2aEngagementsTable.userId, req.userId!))
      .orderBy(desc(a2aEngagementsTable.createdAt));

    res.json({ engagements });
  } catch (err) {
    next(err);
  }
});

router.post("/a2a/engagements", requireAuth, async (req, res, next) => {
  try {
    const parsed = createEngagementSchema.parse(req.body);

    const service = await db
      .select({ id: a2aServiceListingsTable.id })
      .from(a2aServiceListingsTable)
      .innerJoin(agentsTable, eq(a2aServiceListingsTable.agentId, agentsTable.id))
      .where(
        and(
          eq(agentsTable.handle, parsed.serviceHandle),
          eq(a2aServiceListingsTable.status, "active"),
        ),
      )
      .limit(1);

    if (!service[0]) {
      throw new AppError(404, "NOT_FOUND", "A2A service not found for handle: " + parsed.serviceHandle);
    }

    const callerAgent = await db.query.agentsTable.findFirst({
      where: and(
        eq(agentsTable.id, parsed.agentId),
        eq(agentsTable.userId, req.userId!),
      ),
      columns: { id: true },
    });

    if (!callerAgent) {
      throw new AppError(403, "FORBIDDEN", "Agent not found or does not belong to you");
    }

    const [engagement] = await db
      .insert(a2aEngagementsTable)
      .values({
        agentId: parsed.agentId,
        userId: req.userId!,
        serviceId: service[0].id,
        serviceHandle: parsed.serviceHandle,
        serviceName: parsed.serviceName,
        spendingCapUsdc: parsed.spendingCapUsdc,
        paymentModel: parsed.paymentModel,
        pricePerUnit: parsed.pricePerUnit,
        currency: parsed.currency,
      })
      .returning();

    res.status(201).json(engagement);
  } catch (err) {
    next(err);
  }
});

router.get("/a2a/engagements/:id", requireAuth, validateUuidParam("id"), async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(a2aEngagementsTable)
      .where(
        and(
          eq(a2aEngagementsTable.id, req.params.id as string),
          eq(a2aEngagementsTable.userId, req.userId!),
        ),
      )
      .limit(1);

    if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Engagement not found");
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
