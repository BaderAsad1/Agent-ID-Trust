import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
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

const router = Router();

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
});

router.get("/listings", async (req, res, next) => {
  try {
    const filters = {
      category: req.query.category as string | undefined,
      status: req.query.status as string | undefined,
      agentId: req.query.agentId as string | undefined,
      featured: req.query.featured === "true" ? true : req.query.featured === "false" ? false : undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      sortBy: req.query.sortBy as "created" | "rating" | "hires" | "price" | undefined,
      sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
    };
    const result = await listListings(filters);
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

router.get("/listings/:listingId", async (req, res, next) => {
  try {
    const listingId = req.params.listingId as string;
    const listing = await getListingById(listingId);
    if (!listing) throw new AppError(404, "NOT_FOUND", "Listing not found");
    await incrementListingViews(listingId);
    res.json(listing);
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

router.put("/listings/:listingId", requireAuth, async (req, res, next) => {
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

router.patch("/listings/:listingId", requireAuth, async (req, res, next) => {
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

router.delete("/listings/:listingId", requireAuth, async (req, res, next) => {
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

router.get("/listings/:listingId/reviews", async (req, res, next) => {
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

const createOrderSchema = z.object({
  listingId: z.string().uuid(),
  taskDescription: z.string().optional(),
});

router.get("/stripe-config", (_req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
  res.json({ publishableKey });
});

router.post("/orders", requireAuth, async (req, res, next) => {
  try {
    const parsed = createOrderSchema.parse(req.body);
    const result = await createOrder({
      ...parsed,
      buyerUserId: req.userId!,
    });
    if (!result.success) {
      const code = result.error === "LISTING_NOT_FOUND" ? 404
        : result.error === "CANNOT_ORDER_OWN_LISTING" ? 403
        : result.error === "PAYMENT_INTENT_FAILED" ? 502 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.status(201).json({
      ...result.order,
      clientSecret: result.clientSecret,
    });
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
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:orderId", requireAuth, async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const order = await getOrderById(orderId, req.userId!);
    if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
    res.json(order);
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/confirm-payment", requireAuth, async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const result = await confirmPayment(orderId, req.userId!);
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.order);
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/confirm", requireAuth, async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const result = await confirmOrder(orderId, req.userId!);
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.order);
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/complete", requireAuth, async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const result = await completeOrder(orderId, req.userId!);
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.order);
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:orderId/cancel", requireAuth, async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const result = await cancelOrder(orderId, req.userId!);
    if (!result.success) {
      const code = result.error === "ORDER_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.order);
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

export default router;
