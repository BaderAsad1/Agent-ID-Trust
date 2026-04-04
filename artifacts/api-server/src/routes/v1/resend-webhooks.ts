import { Router, type Request, type Response } from "express";
import { logger } from "../../middlewares/request-logger";
import { env } from "../../lib/env";
import {
  parseInboundEmail,
  routeInboundEmail,
  verifyResendWebhookSignature,
  type ResendInboundPayload,
} from "../../services/mail-inbound";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  outboundMessageDeliveriesTable,
  agentMessagesTable,
  agentsTable,
  messageEventsTable,
} from "@workspace/db/schema";

const router = Router();

router.post("/resend/inbound", async (req: Request, res: Response) => {
  try {
    const config = env();
    const rawBody = req.rawBody
      ? req.rawBody.toString("utf8")
      : JSON.stringify(req.body);

    if (!config.RESEND_WEBHOOK_SECRET) {
      logger.warn("[resend-webhook] RESEND_WEBHOOK_SECRET not configured — rejecting inbound webhook (fail-closed)");
      res.status(200).json({ ok: true, error: "webhook_secret_not_configured" });
      return;
    }

    const svixHeaders = {
      svixId: req.headers["svix-id"] as string | undefined,
      svixTimestamp: req.headers["svix-timestamp"] as string | undefined,
      svixSignature: req.headers["svix-signature"] as string | undefined,
    };

    if (!verifyResendWebhookSignature(rawBody, svixHeaders, config.RESEND_WEBHOOK_SECRET)) {
      logger.warn("[resend-webhook] Invalid signature on inbound webhook — rejecting");
      res.status(200).json({ ok: true, error: "invalid_signature" });
      return;
    }

    const payload = req.body as ResendInboundPayload;

    if (!payload?.data?.from || !payload?.data?.to) {
      logger.warn({ payload: JSON.stringify(payload).slice(0, 200) }, "[resend-webhook] Invalid inbound payload");
      res.status(200).json({ ok: true, note: "invalid payload ignored" });
      return;
    }

    const parsed = parseInboundEmail(payload);
    const result = await routeInboundEmail(parsed);

    logger.info({
      from: parsed.from,
      to: parsed.to,
      delivered: result.delivered,
      undeliverable: result.undeliverable,
    }, "[resend-webhook] Inbound email processed");

    res.status(200).json({
      ok: true,
      delivered: result.delivered,
      undeliverable: result.undeliverable,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, "[resend-webhook] Inbound webhook error");
    res.status(200).json({ ok: true, error: "processing_error" });
  }
});

router.post("/resend/bounce", async (req: Request, res: Response) => {
  try {
    const config = env();

    if (!config.RESEND_WEBHOOK_SECRET) {
      logger.warn("[resend-webhook] RESEND_WEBHOOK_SECRET not configured — rejecting bounce webhook (fail-closed)");
      res.status(200).json({ ok: true, error: "webhook_secret_not_configured" });
      return;
    }

    const rawBody = req.rawBody
      ? req.rawBody.toString("utf8")
      : JSON.stringify(req.body);
    const svixHeaders = {
      svixId: req.headers["svix-id"] as string | undefined,
      svixTimestamp: req.headers["svix-timestamp"] as string | undefined,
      svixSignature: req.headers["svix-signature"] as string | undefined,
    };

    if (!verifyResendWebhookSignature(rawBody, svixHeaders, config.RESEND_WEBHOOK_SECRET)) {
      logger.warn("[resend-webhook] Invalid signature on bounce webhook — rejecting");
      res.status(200).json({ ok: true, error: "invalid_signature" });
      return;
    }

    const payload = req.body;
    const eventType = payload?.type as string | undefined;
    const emailId = payload?.data?.email_id;
    const bounceType = payload?.data?.bounce?.type || eventType;

    const HANDLED_EVENT_TYPES = [
      "email.delivered",
      "email.bounced",
      "email.delivery_delayed",
      "email.complained",
    ];

    if (!emailId || !eventType || !HANDLED_EVENT_TYPES.includes(eventType)) {
      res.status(200).json({ ok: true, note: !emailId ? "no email_id" : "unhandled event type" });
      return;
    }

    const delivery = await db.query.outboundMessageDeliveriesTable.findFirst({
      where: eq(outboundMessageDeliveriesTable.providerMessageId, emailId),
    });

    if (delivery) {
      const isBounce = eventType === "email.bounced" || eventType === "email.complained";
      const isDelivered = eventType === "email.delivered";
      const newStatus = isDelivered ? "completed" : isBounce ? "failed" : delivery.status;

      if (newStatus !== delivery.status) {
        await db
          .update(outboundMessageDeliveriesTable)
          .set({
            status: newStatus,
            errorMessage: isBounce ? `Bounce: ${bounceType}` : undefined,
          })
          .where(eq(outboundMessageDeliveriesTable.id, delivery.id));

        const messageStatus = isDelivered ? "delivered" : "bounced";
        await db
          .update(agentMessagesTable)
          .set({ deliveryStatus: messageStatus, updatedAt: new Date() })
          .where(eq(agentMessagesTable.id, delivery.messageId));
      }

      if (isBounce) {
        const message = await db.query.agentMessagesTable.findFirst({
          where: eq(agentMessagesTable.id, delivery.messageId),
          columns: { agentId: true },
        });

        if (message?.agentId) {
          const senderAgent = await db.query.agentsTable.findFirst({
            where: eq(agentsTable.id, message.agentId),
            columns: { id: true, trustScore: true },
          });

          if (senderAgent && senderAgent.trustScore > 0) {
            await db
              .update(agentsTable)
              .set({
                trustScore: sql`greatest(${agentsTable.trustScore} - 1, 0)`,
                updatedAt: new Date(),
              })
              .where(eq(agentsTable.id, senderAgent.id));
          }
        }

        await db.insert(messageEventsTable).values({
          messageId: delivery.messageId,
          eventType: "message.bounced",
          payload: { bounceType, emailId, provider: "resend" },
        });
      }
    }

    logger.info({ emailId, eventType, bounceType }, "[resend-webhook] Bounce event processed");
    res.status(200).json({ ok: true });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg }, "[resend-webhook] Bounce webhook error");
    res.status(200).json({ ok: true, error: "processing_error" });
  }
});

export default router;
