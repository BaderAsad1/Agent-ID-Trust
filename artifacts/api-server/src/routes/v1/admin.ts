/**
 * Admin Routes — Phase 3
 *
 * These endpoints are for Agent ID platform operators (admins) only.
 * Admin identity is verified via a separate admin auth path (admin API key header).
 *
 * POST /v1/admin/agents/:id/revoke        — Revoke any agent with reason
 * POST /v1/admin/tokens/revoke            — Revoke any token by token_id
 * POST /v1/admin/sessions/revoke          — Revoke any session by session_id
 * POST /v1/admin/clients/:clientId/revoke — Revoke any RP client globally
 * GET  /v1/admin/audit-log               — Paginated audit log with filters
 * GET  /v1/admin/audit-log/export        — CSV export of audit log
 * POST /v1/admin/claims/:agentId/resolve — Adjudicate a dispute claim
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod/v4";
import { eq, and, gte, lte, desc, like, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  oauthTokensTable,
  agentidSessionsTable,
  oauthClientsTable,
  auditEventsTable,
  agentClaimHistoryTable,
} from "@workspace/db/schema";
import { AppError } from "../../middlewares/error-handler";
import { writeAuditEvent } from "../../services/auth-session";

const router = Router();

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = req.headers["x-admin-key"] as string | undefined;
  const expectedKey = process.env.ADMIN_SECRET_KEY;

  if (!adminKey || !expectedKey || adminKey !== expectedKey) {
    res.status(401).json({
      error: "ADMIN_UNAUTHORIZED",
      message: "Admin authentication required. Provide X-Admin-Key header.",
    });
    return;
  }
  next();
}

router.use(adminAuth);

const revokeAgentSchema = z.object({
  reason: z.string().max(100),
  statement: z.string().max(2000).optional(),
});

router.post("/agents/:id/revoke", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = revokeAgentSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);

    const { reason, statement } = parsed.data;
    const agentId = req.params.id as string;

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });
    if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");

    await db.update(agentsTable).set({
      status: "revoked",
      revokedAt: new Date(),
      revocationReason: reason,
      revocationStatement: statement,
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, agentId));

    await writeAuditEvent("admin", "system", "admin.agent.revoked", "agent", agentId, {
      reason,
      statement,
      signal: "admin_revocation",
    });

    res.json({ success: true, agentId, status: "revoked", revokedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post("/tokens/revoke", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tokenId, reason } = req.body;
    if (!tokenId) throw new AppError(400, "VALIDATION_ERROR", "tokenId is required");

    const token = await db.query.oauthTokensTable.findFirst({
      where: eq(oauthTokensTable.tokenId, tokenId),
    });
    if (!token) throw new AppError(404, "NOT_FOUND", "Token not found");

    await db.update(oauthTokensTable)
      .set({ revokedAt: new Date(), revokedReason: reason || "admin_revocation" })
      .where(eq(oauthTokensTable.id, token.id));

    await writeAuditEvent("admin", "system", "admin.token.revoked", "token", tokenId, {
      tokenId,
      reason: reason || "admin_revocation",
      signal: "admin_revocation",
    });

    res.json({ success: true, tokenId, revokedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post("/sessions/revoke", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, reason } = req.body;
    if (!sessionId) throw new AppError(400, "VALIDATION_ERROR", "sessionId is required");

    const session = await db.query.agentidSessionsTable.findFirst({
      where: eq(agentidSessionsTable.sessionId, sessionId),
    });
    if (!session) throw new AppError(404, "NOT_FOUND", "Session not found");

    await db.update(agentidSessionsTable)
      .set({ revoked: true, revokedAt: new Date(), revokedReason: reason || "admin_revocation" })
      .where(eq(agentidSessionsTable.id, session.id));

    await writeAuditEvent("admin", "system", "admin.session.revoked", "session", sessionId, {
      sessionId,
      agentId: session.agentId,
      reason: reason || "admin_revocation",
      signal: "admin_revocation",
    });

    res.json({ success: true, sessionId, revokedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post("/clients/:clientId/revoke", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientId = req.params.clientId as string;
    const { reason } = req.body;

    const client = await db.query.oauthClientsTable.findFirst({
      where: eq(oauthClientsTable.clientId, clientId),
    });
    if (!client) throw new AppError(404, "NOT_FOUND", "Client not found");

    await db.update(oauthClientsTable)
      .set({ revokedAt: new Date() })
      .where(eq(oauthClientsTable.id, client.id));

    await writeAuditEvent("admin", "system", "admin.client.revoked", "oauth_client", client.id, {
      clientId,
      reason: reason || "admin_revocation",
      signal: "admin_revocation",
    });

    res.json({ success: true, clientId, revokedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

const auditLogQuerySchema = z.object({
  actor_id: z.string().optional(),
  actor_type: z.string().optional(),
  action: z.string().optional(),
  target_type: z.string().optional(),
  target_id: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(500).default(50),
  offset: z.coerce.number().min(0).default(0),
});

router.get("/audit-log", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = auditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters");

    const { actor_id, actor_type, action, target_type, target_id, from, to, limit, offset } = parsed.data;

    const conditions = [];
    if (actor_id) conditions.push(eq(auditEventsTable.actorId, actor_id));
    if (actor_type) conditions.push(eq(auditEventsTable.actorType, actor_type));
    if (action) conditions.push(eq(auditEventsTable.eventType, action));
    if (target_type) conditions.push(eq(auditEventsTable.targetType, target_type));
    if (target_id) conditions.push(eq(auditEventsTable.targetId, target_id));
    if (from) conditions.push(gte(auditEventsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(auditEventsTable.createdAt, new Date(to)));

    const events = await db.query.auditEventsTable.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(auditEventsTable.createdAt),
      limit,
      offset,
    });

    res.json({ events, total: events.length, limit, offset });
  } catch (err) {
    next(err);
  }
});

router.get("/audit-log/export", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = auditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters");

    const { actor_id, actor_type, action, target_type, target_id, from, to } = parsed.data;

    const conditions = [];
    if (actor_id) conditions.push(eq(auditEventsTable.actorId, actor_id));
    if (actor_type) conditions.push(eq(auditEventsTable.actorType, actor_type));
    if (action) conditions.push(eq(auditEventsTable.eventType, action));
    if (target_type) conditions.push(eq(auditEventsTable.targetType, target_type));
    if (target_id) conditions.push(eq(auditEventsTable.targetId, target_id));
    if (from) conditions.push(gte(auditEventsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(auditEventsTable.createdAt, new Date(to)));

    const events = await db.query.auditEventsTable.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(auditEventsTable.createdAt),
      limit: 10000,
    });

    const csvHeader = "id,actor_type,actor_id,event_type,target_type,target_id,ip_address,created_at,payload\n";
    const csvRows = events.map(e => {
      const payload = JSON.stringify(e.payload || {}).replace(/"/g, '""');
      return `${e.id},${e.actorType},${e.actorId},${e.eventType},${e.targetType || ""},${e.targetId || ""},${e.ipAddress || ""},${e.createdAt.toISOString()},"${payload}"`;
    }).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.csv"`);
    res.send(csvHeader + csvRows);
  } catch (err) {
    next(err);
  }
});

const resolveClaimSchema = z.object({
  historyId: z.string().uuid(),
  resolution: z.enum(["approved", "rejected"]),
  notes: z.string().max(2000).optional(),
});

router.post("/claims/resolve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = resolveClaimSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);

    const { historyId, resolution, notes } = parsed.data;

    const record = await db.query.agentClaimHistoryTable.findFirst({
      where: eq(agentClaimHistoryTable.id, historyId),
    });
    if (!record) throw new AppError(404, "NOT_FOUND", "Claim history record not found");

    await db.update(agentClaimHistoryTable).set({
      disputeStatus: resolution === "approved" ? "resolved_approved" : "resolved_rejected",
      resolvedAt: new Date(),
      resolutionNotes: notes,
    }).where(eq(agentClaimHistoryTable.id, historyId));

    await writeAuditEvent("admin", "system", "admin.claim.resolved", "agent", record.agentId, {
      historyId,
      resolution,
      notes,
      signal: "admin_claim_resolution",
    });

    res.json({ success: true, historyId, resolution, resolvedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
