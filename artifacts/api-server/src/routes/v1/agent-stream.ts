/**
 * GET /agents/:agentId/stream  — Real-time Server-Sent Events stream
 *
 * Delivers live events to an authenticated agent (or any subscriber with
 * the agent's key) without polling. Stays open for the connection lifetime.
 *
 * Auth: X-Agent-Key header  OR  Authorization: Bearer <pop-jwt>
 *
 * Events emitted:
 *   connected          — initial handshake with agent identity
 *   heartbeat          — keepalive ping every 25 s (also contains live status)
 *   message_received   — new inbound agent mail
 *   task_updated       — task status changed
 *   a2a_call_received  — an agent called one of your services
 *   trust_updated      — trust score / tier changed
 *   key_rotated        — agent key was rotated (security alert)
 *   marketplace_alert  — new order requiring action
 *   *                  — any other event from the activity log
 *
 * Query params:
 *   lastEventId — resume from a specific event (skips older events)
 *
 * Usage (browser / SDK):
 *   const es = new EventSource("/api/v1/agents/<id>/stream", {
 *     headers: { "X-Agent-Key": "agk_..." },
 *   });
 *   es.addEventListener("message_received", e => console.log(JSON.parse(e.data)));
 *
 * Usage (SDK):
 *   agent.onEvent((event) => { ... });
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, gt, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentActivityLogTable, agentsTable } from "@workspace/db/schema";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { logger } from "../../middlewares/request-logger";
import { validateUuidParam } from "../../middlewares/validation";

/**
 * Middleware: promote ?agentKey= query param into X-Agent-Key header.
 * EventSource (browser API) cannot set custom headers, so SDK clients
 * pass the agent key as a query parameter for the SSE endpoint only.
 * The key is consumed and removed from req.query before reaching auth.
 */
function promoteAgentKeyQueryParam(req: Request, _res: Response, next: NextFunction) {
  const key = req.query.agentKey as string | undefined;
  if (key && !req.headers["x-agent-key"]) {
    req.headers["x-agent-key"] = key;
    delete req.query.agentKey;
  }
  next();
}

const router = Router();

const POLL_INTERVAL_MS  = 3_000;  // check for new events every 3 s
const HEARTBEAT_MS      = 25_000; // SSE keepalive (nginx proxy timeout is 60 s)
const MAX_DURATION_MS   = 30 * 60 * 1000; // max 30 min per connection

function sendEvent(res: Response, event: string, data: unknown, id?: string) {
  if (id) res.write(`id: ${id}\n`);
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // flush for proxies that buffer
  if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
    (res as unknown as { flush: () => void }).flush();
  }
}

router.get(
  "/:agentId/stream",
  validateUuidParam("agentId"),
  promoteAgentKeyQueryParam,
  requireAgentAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agentId        = req.params.agentId as string;
      const callerAgent    = req.authenticatedAgent!;

      // Agents can only subscribe to their own stream
      if (callerAgent.id !== agentId) {
        throw new AppError(403, "FORBIDDEN", "You can only stream events for your own agent");
      }

      // SSE headers
      res.setHeader("Content-Type",      "text/event-stream");
      res.setHeader("Cache-Control",     "no-cache, no-store");
      res.setHeader("Connection",        "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // disable nginx / Caddy proxy buffering
      res.setHeader("Transfer-Encoding", "identity");
      res.statusCode = 200;

      // Resume from a specific event ID if requested
      const lastEventId = req.headers["last-event-id"] as string | undefined
        || req.query.lastEventId as string | undefined;

      // Determine the cutoff: either the timestamp of the last seen event, or now
      let lastCheckedAt = new Date();
      if (lastEventId) {
        const lastEvent = await db.query.agentActivityLogTable.findFirst({
          where: and(
            eq(agentActivityLogTable.agentId, agentId),
            eq(agentActivityLogTable.id, lastEventId),
          ),
        });
        if (lastEvent) lastCheckedAt = lastEvent.createdAt;
      }

      // Fetch live agent status for the connected event
      const agent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, agentId),
        columns: { id: true, handle: true, trustTier: true, verificationStatus: true, status: true },
      });

      // Initial connected event
      sendEvent(res, "connected", {
        agentId,
        handle:             agent?.handle ?? null,
        trustTier:          agent?.trustTier,
        verificationStatus: agent?.verificationStatus,
        status:             agent?.status,
        streamStartedAt:    new Date().toISOString(),
        note:               "Stream open. Listening for events.",
      });

      let closed = false;
      req.on("close",   () => { closed = true; });
      req.on("aborted", () => { closed = true; });

      // Heartbeat — keeps the connection alive through idle periods
      const heartbeatTimer = setInterval(async () => {
        if (closed) return;
        try {
          // Heartbeat also carries live agent status
          const liveAgent = await db.query.agentsTable.findFirst({
            where: eq(agentsTable.id, agentId),
            columns: { trustTier: true, verificationStatus: true, status: true },
          });
          sendEvent(res, "heartbeat", {
            timestamp:          new Date().toISOString(),
            trustTier:          liveAgent?.trustTier,
            verificationStatus: liveAgent?.verificationStatus,
            status:             liveAgent?.status,
          });
        } catch { /* network blip — next tick will retry */ }
      }, HEARTBEAT_MS);

      // Event poller — polls activity log for new rows
      const pollTimer = setInterval(async () => {
        if (closed) return;
        try {
          const newEvents = await db.query.agentActivityLogTable.findMany({
            where: and(
              eq(agentActivityLogTable.agentId, agentId),
              gt(agentActivityLogTable.createdAt, lastCheckedAt),
            ),
            orderBy: [asc(agentActivityLogTable.createdAt)],
            limit: 50, // don't flood if many events queued up
          });

          for (const evt of newEvents) {
            if (closed) break;
            sendEvent(
              res,
              evt.eventType,
              {
                agentId,
                eventId:   evt.id,
                eventType: evt.eventType,
                payload:   evt.payload,
                timestamp: evt.createdAt.toISOString(),
              },
              evt.id, // SSE id= for resumption
            );
            lastCheckedAt = evt.createdAt;
          }
        } catch (err) {
          logger.warn({ agentId, err: (err as Error).message }, "[sse] Poll error");
        }
      }, POLL_INTERVAL_MS);

      // Auto-close after max duration to prevent zombie connections
      const maxDurationTimer = setTimeout(() => {
        if (!closed) {
          sendEvent(res, "stream_closed", {
            reason: "max_duration_reached",
            reconnect: true,
            timestamp: new Date().toISOString(),
          });
          res.end();
        }
      }, MAX_DURATION_MS);

      // Cleanup on disconnect
      req.on("close", () => {
        closed = true;
        clearInterval(heartbeatTimer);
        clearInterval(pollTimer);
        clearTimeout(maxDurationTimer);
        logger.debug({ agentId }, "[sse] Client disconnected");
      });

    } catch (err) {
      next(err);
    }
  },
);

export default router;
