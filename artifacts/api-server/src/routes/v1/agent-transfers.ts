import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import {
  createTransfer,
  getTransfer,
  listAgentTransfers,
  updateTransfer,
  acceptTransfer,
  advanceToTransferPending,
  startHandoff,
  completeHandoff,
  cancelTransfer,
  disputeTransfer,
  getTransferEvents,
  getTransferAssets,
  reconnectAsset,
} from "../../services/agent-transfer";
import { generateReadinessReport } from "../../services/transfer-readiness";
import { logActivity } from "../../services/activity-logger";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";

function requireTransferAuth(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-agent-key"]) {
    return requireAgentAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (req.authenticatedAgent) {
        req.userId = req.authenticatedAgent.userId;
      }
      next();
    });
  }
  return requireAuth(req, res, next);
}

function requireTransferScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.authenticatedAgent) {
      const userScopes = (req as unknown as Record<string, unknown>).scopes as string[] | undefined;
      if (!userScopes || userScopes.length === 0) {
        return next(new AppError(403, "INSUFFICIENT_SCOPE", `Agent-auth callers require scope: ${scope}`));
      }
      if (!userScopes.includes(scope) && !userScopes.includes("transfer:*")) {
        return next(new AppError(403, "INSUFFICIENT_SCOPE", `Missing required scope: ${scope}`));
      }
    }
    next();
  };
}

const router = Router();

const createTransferSchema = z.object({
  transferType: z.enum(["private_transfer", "internal_reassignment"]),
  buyerId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

const updateTransferSchema = z.object({
  askingPrice: z.number().int().min(0).optional(),
  buyerId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

const acceptTransferSchema = z.object({
  agreedPrice: z.number().int().min(0).optional(),
});

const disputeTransferSchema = z.object({
  reason: z.string().min(1).max(2000),
});

const cancelTransferSchema = z.object({
  reason: z.string().max(2000).optional(),
});

router.get("/:agentId/transfers/readiness", requireTransferAuth, requireTransferScope("transfer:read"), async (req, res, next) => {
  try {
    const agent = await db.query.agentsTable.findFirst({
      where: and(eq(agentsTable.id, req.params.agentId as string), eq(agentsTable.userId, req.userId!)),
    });
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found or you do not own it");
    }

    const report = await generateReadinessReport(req.params.agentId as string);

    await logActivity({
      agentId: req.params.agentId as string,
      eventType: "transfer.readiness_report_generated",
      payload: { summary: report.summary },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }).catch(() => {});

    res.json(report);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return next(new AppError(404, "NOT_FOUND", err.message));
    }
    next(err);
  }
});

router.post("/:agentId/transfers", requireTransferAuth, requireTransferScope("transfer:create"), async (req, res, next) => {
  try {
    const parsed = createTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid transfer data", parsed.error.issues);
    }

    const transfer = await createTransfer({
      agentId: req.params.agentId as string,
      sellerId: req.userId!,
      ...parsed.data,
    });

    await logActivity({
      agentId: req.params.agentId as string,
      eventType: "transfer.created",
      payload: { transferId: transfer.id, transferType: parsed.data.transferType },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }).catch(() => {});

    res.status(201).json(transfer);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found") || err.message.includes("do not own")) {
        return next(new AppError(404, "NOT_FOUND", err.message));
      }
      if (err.message.includes("not ready")) {
        return next(new AppError(422, "NOT_READY", err.message));
      }
    }
    next(err);
  }
});

router.get("/:agentId/transfers", requireTransferAuth, requireTransferScope("transfer:read"), async (req, res, next) => {
  try {
    const transfers = await listAgentTransfers(req.params.agentId as string);
    const filtered = transfers.filter(
      t => t.sellerId === req.userId || t.buyerId === req.userId
    );
    res.json({ transfers: filtered });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/transfers/:transferId", requireTransferAuth, requireTransferScope("transfer:read"), async (req, res, next) => {
  try {
    const transfer = await getTransfer(req.params.transferId as string);
    if (!transfer || transfer.agentId !== req.params.agentId) {
      throw new AppError(404, "NOT_FOUND", "Transfer not found");
    }
    if (transfer.sellerId !== req.userId && transfer.buyerId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You are not a participant of this transfer");
    }
    res.json(transfer);
  } catch (err) {
    next(err);
  }
});

router.patch("/:agentId/transfers/:transferId", requireTransferAuth, requireTransferScope("transfer:write"), async (req, res, next) => {
  try {
    const parsed = updateTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid update data", parsed.error.issues);
    }

    const updated = await updateTransfer(req.params.transferId as string, req.userId!, parsed.data);
    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return next(new AppError(404, "NOT_FOUND", err.message));
    }
    if (err instanceof Error && err.message.includes("Only the seller")) {
      return next(new AppError(403, "FORBIDDEN", err.message));
    }
    next(err);
  }
});

router.post("/:agentId/transfers/:transferId/list", (_req, _res, next) => {
  next(new AppError(501, "NOT_ENABLED", "Public listing of transfers is not available"));
});

router.post("/:agentId/transfers/:transferId/accept", requireTransferAuth, requireTransferScope("transfer:write"), async (req, res, next) => {
  try {
    const parsed = acceptTransferSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid accept data", parsed.error.issues);
    }

    const updated = await acceptTransfer(req.params.transferId as string, req.userId!, parsed.data.agreedPrice);

    await logActivity({
      agentId: req.params.agentId as string,
      eventType: "transfer.hold_funded",
      payload: { transferId: req.params.transferId, agreedPrice: parsed.data.agreedPrice },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }).catch(() => {});

    res.json(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) return next(new AppError(404, "NOT_FOUND", err.message));
      if (err.message.includes("Seller cannot")) return next(new AppError(403, "FORBIDDEN", err.message));
      if (err.message.includes("designated for a specific buyer")) return next(new AppError(403, "FORBIDDEN", err.message));
      if (err.message.includes("Cannot accept")) return next(new AppError(422, "INVALID_STATE", err.message));
    }
    next(err);
  }
});

router.post("/:agentId/transfers/:transferId/advance", requireTransferAuth, requireTransferScope("transfer:write"), async (req, res, next) => {
  try {
    const updated = await advanceToTransferPending(req.params.transferId as string, req.userId!);
    res.json(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) return next(new AppError(404, "NOT_FOUND", err.message));
      if (err.message.includes("Only the seller")) return next(new AppError(403, "FORBIDDEN", err.message));
      if (err.message.includes("Cannot advance")) return next(new AppError(422, "INVALID_STATE", err.message));
    }
    next(err);
  }
});

router.post("/:agentId/transfers/:transferId/fund-hold", (_req, _res, next) => {
  next(new AppError(501, "NOT_ENABLED", "Escrow fund-hold is not available"));
});

router.post("/:agentId/transfers/:transferId/start-handoff", requireTransferAuth, requireTransferScope("transfer:write"), async (req, res, next) => {
  try {
    const updated = await startHandoff(req.params.transferId as string, req.userId!);

    await logActivity({
      agentId: req.params.agentId as string,
      eventType: "transfer.handoff_started",
      payload: { transferId: req.params.transferId },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }).catch(() => {});

    res.json(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) return next(new AppError(404, "NOT_FOUND", err.message));
      if (err.message.includes("Only the seller")) return next(new AppError(403, "FORBIDDEN", err.message));
      if (err.message.includes("No buyer")) return next(new AppError(422, "NO_BUYER", err.message));
      if (err.message.includes("Cannot start")) return next(new AppError(422, "INVALID_STATE", err.message));
    }
    next(err);
  }
});

router.post("/:agentId/transfers/:transferId/complete", requireTransferAuth, requireTransferScope("transfer:write"), async (req, res, next) => {
  try {
    const updated = await completeHandoff(req.params.transferId as string, req.userId!);

    await logActivity({
      agentId: req.params.agentId as string,
      eventType: "transfer.handoff_completed",
      payload: { transferId: req.params.transferId },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }).catch(() => {});

    res.json(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) return next(new AppError(404, "NOT_FOUND", err.message));
      if (err.message.includes("Only the seller")) return next(new AppError(403, "FORBIDDEN", err.message));
      if (err.message.includes("No buyer")) return next(new AppError(422, "NO_BUYER", err.message));
      if (err.message.includes("Cannot complete")) return next(new AppError(422, "INVALID_STATE", err.message));
    }
    next(err);
  }
});

router.post("/:agentId/transfers/:transferId/cancel", requireTransferAuth, requireTransferScope("transfer:write"), async (req, res, next) => {
  try {
    const parsed = cancelTransferSchema.safeParse(req.body || {});
    const updated = await cancelTransfer(req.params.transferId as string, req.userId!, parsed.success ? parsed.data.reason : undefined);

    await logActivity({
      agentId: req.params.agentId as string,
      eventType: "transfer.cancelled",
      payload: { transferId: req.params.transferId, reason: parsed.success ? parsed.data.reason : undefined },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }).catch(() => {});

    res.json(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) return next(new AppError(404, "NOT_FOUND", err.message));
      if (err.message.includes("Only the seller or buyer")) return next(new AppError(403, "FORBIDDEN", err.message));
      if (err.message.includes("Cannot cancel")) return next(new AppError(422, "INVALID_STATE", err.message));
    }
    next(err);
  }
});

router.post("/:agentId/transfers/:transferId/dispute", requireTransferAuth, requireTransferScope("transfer:write"), async (req, res, next) => {
  try {
    const parsed = disputeTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "reason is required", parsed.error.issues);
    }

    const updated = await disputeTransfer(req.params.transferId as string, req.userId!, parsed.data.reason);

    await logActivity({
      agentId: req.params.agentId as string,
      eventType: "transfer.dispute_raised",
      payload: { transferId: req.params.transferId, reason: parsed.data.reason },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }).catch(() => {});

    res.json(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) return next(new AppError(404, "NOT_FOUND", err.message));
      if (err.message.includes("Only the seller or buyer")) return next(new AppError(403, "FORBIDDEN", err.message));
      if (err.message.includes("Cannot dispute")) return next(new AppError(422, "INVALID_STATE", err.message));
    }
    next(err);
  }
});

router.get("/:agentId/transfers/:transferId/events", requireTransferAuth, requireTransferScope("transfer:read"), async (req, res, next) => {
  try {
    const transfer = await getTransfer(req.params.transferId as string);
    if (!transfer || transfer.agentId !== req.params.agentId) {
      throw new AppError(404, "NOT_FOUND", "Transfer not found");
    }
    if (transfer.sellerId !== req.userId && transfer.buyerId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You are not a participant of this transfer");
    }
    const events = await getTransferEvents(req.params.transferId as string);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/transfers/:transferId/assets/:assetId/reconnect", requireTransferAuth, requireTransferScope("transfer:write"), async (req, res, next) => {
  try {
    const transfer = await getTransfer(req.params.transferId as string);
    if (!transfer || transfer.agentId !== req.params.agentId) {
      throw new AppError(404, "NOT_FOUND", "Transfer not found");
    }
    if (transfer.buyerId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "Only the buyer can reconnect assets");
    }
    if (transfer.status !== "in_handoff" && transfer.status !== "completed") {
      throw new AppError(422, "INVALID_STATE", "Assets can only be reconnected during or after handoff");
    }

    const asset = await reconnectAsset(req.params.assetId as string, req.params.transferId as string);
    res.json(asset);
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(err);
  }
});

router.get("/:agentId/transfers/:transferId/assets", requireTransferAuth, requireTransferScope("transfer:read"), async (req, res, next) => {
  try {
    const transfer = await getTransfer(req.params.transferId as string);
    if (!transfer || transfer.agentId !== req.params.agentId) {
      throw new AppError(404, "NOT_FOUND", "Transfer not found");
    }
    if (transfer.sellerId !== req.userId && transfer.buyerId !== req.userId) {
      throw new AppError(403, "FORBIDDEN", "You are not a participant of this transfer");
    }
    const assets = await getTransferAssets(req.params.transferId as string);
    res.json({ assets });
  } catch (err) {
    next(err);
  }
});

export default router;
