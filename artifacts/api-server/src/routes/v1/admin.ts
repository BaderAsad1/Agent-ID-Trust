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
import { timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";
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

const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "ADMIN_RATE_LIMITED",
    message: "Too many admin requests. Limit is 30 per minute per IP.",
  },
});

// Use req.ip which respects Express trust proxy settings (canonical, de-spoofable when
// proxy trust is configured). x-forwarded-for is included as supplemental context only.
function getRequestorIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

function adminAuditMeta(req: Request, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const forwarded = req.headers["x-forwarded-for"];
  return {
    ...extra,
    requestorIp: getRequestorIp(req),
    requestorIpForwarded: typeof forwarded === "string" ? forwarded : undefined,
    adminIdentity: (req.headers["x-admin-identity"] as string | undefined) ?? null,
  };
}

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  // Security: always return the same generic error regardless of which check
  // fails so callers cannot distinguish missing key vs wrong key (timing oracle).
  const deny = () => {
    res.status(401).json({
      error: "ADMIN_UNAUTHORIZED",
      message: "Admin authentication required. Provide X-Admin-Key header.",
    });
  };

  const adminKey = req.headers["x-admin-key"] as string | undefined;
  const expectedKey = process.env.ADMIN_SECRET_KEY;

  // Fail closed: if env var is not set, no key can ever be valid.
  // Log a warning when the secret is absent so operators are alerted.
  if (!expectedKey) {
    console.warn("[admin] ADMIN_SECRET_KEY is not set; all admin requests will be denied.");
    deny();
    return;
  }
  if (!adminKey) {
    deny();
    return;
  }

  // Use constant-time comparison to prevent timing-oracle attacks that could
  // allow an attacker to guess the secret byte-by-byte via response timing.
  // We compare fixed-length Buffers; length differences are normalised by
  // always comparing expectedKey.length bytes (the attacker learns nothing
  // new from the length of their own provided string).
  const provided = Buffer.from(adminKey, "utf8");
  const expected = Buffer.from(expectedKey, "utf8");

  // Pad the shorter buffer so timingSafeEqual receives equal-length inputs.
  // Without this, a length mismatch would throw before comparison happens.
  const maxLen = Math.max(provided.length, expected.length);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  provided.copy(a);
  expected.copy(b);

  if (!timingSafeEqual(a, b)) {
    deny();
    return;
  }

  next();
}

let adminIpWarningLogged = false;
function adminIpAllowlist(req: Request, res: Response, next: NextFunction): void {
  const allowedRaw = process.env.ADMIN_ALLOWED_IPS;
  if (!allowedRaw || allowedRaw.trim() === "") {
    if (process.env.NODE_ENV === "production" && !adminIpWarningLogged) {
      console.warn("[admin] WARNING: ADMIN_ALLOWED_IPS is not set — admin routes are accessible from any IP with the correct secret. Set ADMIN_ALLOWED_IPS to restrict access.");
      adminIpWarningLogged = true;
    }
    next();
    return;
  }

  const allowedIps = allowedRaw.split(",").map(ip => ip.trim()).filter(Boolean);
  const reqIp = getRequestorIp(req);

  if (!allowedIps.includes(reqIp)) {
    console.warn(`[admin] IP ${reqIp} not in ADMIN_ALLOWED_IPS allowlist`);
    res.status(403).json({
      error: "ADMIN_FORBIDDEN",
      message: "Request denied: IP not in admin allowlist.",
    });
    return;
  }

  next();
}

router.use(adminRateLimiter);
router.use(adminIpAllowlist);
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

    // M5: Wrap core revocation writes in a transaction so agent status and key
    // revocation are always consistent — no partial state on failure.
    await db.transaction(async (tx) => {
      await tx.update(agentsTable).set({
        status: "revoked",
        revokedAt: new Date(),
        revocationReason: reason,
        revocationStatement: statement,
        updatedAt: new Date(),
      }).where(eq(agentsTable.id, agentId));

      const { agentKeysTable } = await import("@workspace/db/schema");
      await tx.update(agentKeysTable)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(and(
          eq(agentKeysTable.agentId, agentId),
          eq(agentKeysTable.status, "active"),
        ));

      const { agentCredentialsTable } = await import("@workspace/db/schema");
      await tx.update(agentCredentialsTable)
        .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(agentCredentialsTable.agentId, agentId),
          eq(agentCredentialsTable.isActive, true),
        ));
    });

    try {
      const { clearVcCache } = await import("../../services/verifiable-credential");
      clearVcCache(agentId);
    } catch {}

    try {
      if (agent.handle) {
        const { deleteResolutionCache } = await import("./resolve");
        const { normalizeHandle } = await import("../../utils/handle");
        await deleteResolutionCache(normalizeHandle(agent.handle));
      }
    } catch {}

    setImmediate(async () => {
      try {
        const { agentAttestationsTable } = await import("@workspace/db/schema");
        const { recomputeAndStore } = await import("../../services/trust-score");
        const { isNull: isNullOp } = await import("drizzle-orm");

        const attestedAgents = await db
          .select({ subjectId: agentAttestationsTable.subjectId })
          .from(agentAttestationsTable)
          .where(and(
            eq(agentAttestationsTable.attesterId, agentId),
            isNullOp(agentAttestationsTable.revokedAt),
          ));

        if (attestedAgents.length > 0) {
          await db.update(agentAttestationsTable)
            .set({ revokedAt: new Date() })
            .where(and(
              eq(agentAttestationsTable.attesterId, agentId),
              isNullOp(agentAttestationsTable.revokedAt),
            ));
        }

        for (const { subjectId } of attestedAgents) {
          try { await recomputeAndStore(subjectId); } catch {}
        }
      } catch {}
    });

    await writeAuditEvent("admin", "system", "admin.agent.revoked", "agent", agentId,
      adminAuditMeta(req, { reason, statement, signal: "admin_revocation" }),
      getRequestorIp(req),
    );

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

    await writeAuditEvent("admin", "system", "admin.token.revoked", "token", tokenId,
      adminAuditMeta(req, { tokenId, reason: reason || "admin_revocation", signal: "admin_revocation" }),
      getRequestorIp(req),
    );

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

    await writeAuditEvent("admin", "system", "admin.session.revoked", "session", sessionId,
      adminAuditMeta(req, { sessionId, agentId: session.agentId, reason: reason || "admin_revocation", signal: "admin_revocation" }),
      getRequestorIp(req),
    );

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

    await writeAuditEvent("admin", "system", "admin.client.revoked", "oauth_client", client.id,
      adminAuditMeta(req, { clientId, reason: reason || "admin_revocation", signal: "admin_revocation" }),
      getRequestorIp(req),
    );

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

    await writeAuditEvent("admin", "system", "admin.claim.resolved", "agent", record.agentId,
      adminAuditMeta(req, { historyId, resolution, notes, signal: "admin_claim_resolution" }),
      getRequestorIp(req),
    );

    res.json({ success: true, historyId, resolution, resolvedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
