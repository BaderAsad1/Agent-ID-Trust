import { createHmac } from "crypto";
import { eq, and, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentWebhooksTable,
  webhookDeliveriesTable,
  type AgentWebhook,
} from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";

const RETRY_INTERVALS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  8 * 60 * 60 * 1000,
];

const MAX_CONSECUTIVE_FAILURES = 50;

function signPayload(payload: string, secret: string, timestamp: number): string {
  const signatureBody = `${timestamp}.${payload}`;
  return createHmac("sha256", secret).update(signatureBody).digest("hex");
}

export function buildSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const v1 = signPayload(payload, secret, timestamp);
  return `t=${timestamp},v1=${v1}`;
}

export async function deliverWebhookEvent(
  agentId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const webhooks = await db.query.agentWebhooksTable.findMany({
    where: and(
      eq(agentWebhooksTable.agentId, agentId),
      eq(agentWebhooksTable.active, true),
    ),
  });

  const matchingWebhooks = webhooks.filter((wh) => {
    const events = wh.events as string[];
    return events.length === 0 || events.includes(event) || events.includes("*");
  });

  for (const webhook of matchingWebhooks) {
    await attemptDelivery(webhook, agentId, event, payload);
  }
}

async function attemptDelivery(
  webhook: AgentWebhook,
  agentId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const body = JSON.stringify({ event, agentId, data: payload, timestamp: new Date().toISOString() });
  const signature = buildSignatureHeader(body, webhook.secret);

  const [delivery] = await db
    .insert(webhookDeliveriesTable)
    .values({
      webhookId: webhook.id,
      agentId,
      event,
      payload,
      status: "pending",
      attempts: 1,
    })
    .returning();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AgentID-Signature": signature,
        "X-AgentID-Event": event,
        "X-AgentID-Delivery": delivery.id,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await response.text().catch(() => "");
    const httpStatus = response.status;

    if (response.ok) {
      await db
        .update(webhookDeliveriesTable)
        .set({
          status: "delivered",
          httpStatus,
          responseBody: responseBody.slice(0, 1000),
          deliveredAt: new Date(),
        })
        .where(eq(webhookDeliveriesTable.id, delivery.id));

      await db
        .update(agentWebhooksTable)
        .set({
          consecutiveFailures: 0,
          lastDeliveryAt: new Date(),
        })
        .where(eq(agentWebhooksTable.id, webhook.id));
    } else {
      await handleDeliveryFailure(webhook, delivery.id, httpStatus, responseBody);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await handleDeliveryFailure(webhook, delivery.id, 0, message);
  }
}

async function handleDeliveryFailure(
  webhook: AgentWebhook,
  deliveryId: string,
  httpStatus: number,
  responseBody: string,
) {
  const delivery = await db.query.webhookDeliveriesTable.findFirst({
    where: eq(webhookDeliveriesTable.id, deliveryId),
  });
  const attempts = delivery?.attempts ?? 1;

  const retryIndex = Math.min(attempts - 1, RETRY_INTERVALS_MS.length - 1);
  const nextRetryAt = attempts <= RETRY_INTERVALS_MS.length
    ? new Date(Date.now() + RETRY_INTERVALS_MS[retryIndex])
    : null;

  await db
    .update(webhookDeliveriesTable)
    .set({
      status: nextRetryAt ? "pending" : "failed",
      httpStatus: httpStatus || null,
      responseBody: responseBody.slice(0, 1000),
      nextRetryAt,
      ...(nextRetryAt ? {} : { failedAt: new Date() }),
    })
    .where(eq(webhookDeliveriesTable.id, deliveryId));

  const newFailureCount = webhook.consecutiveFailures + 1;

  if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
    await db
      .update(agentWebhooksTable)
      .set({
        active: false,
        consecutiveFailures: newFailureCount,
        disabledAt: new Date(),
        disableReason: `Auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive delivery failures`,
      })
      .where(eq(agentWebhooksTable.id, webhook.id));

    logger.warn(
      { webhookId: webhook.id, agentId: webhook.agentId },
      `[webhook-delivery] Webhook auto-disabled after ${MAX_CONSECUTIVE_FAILURES} failures`,
    );
  } else {
    await db
      .update(agentWebhooksTable)
      .set({ consecutiveFailures: newFailureCount })
      .where(eq(agentWebhooksTable.id, webhook.id));
  }
}

export async function retryPendingDeliveries() {
  const now = new Date();
  const pendingDeliveries = await db.query.webhookDeliveriesTable.findMany({
    where: and(
      eq(webhookDeliveriesTable.status, "pending"),
      lte(webhookDeliveriesTable.nextRetryAt, now),
    ),
    limit: 100,
  });

  for (const delivery of pendingDeliveries) {
    const webhook = await db.query.agentWebhooksTable.findFirst({
      where: eq(agentWebhooksTable.id, delivery.webhookId),
    });

    if (!webhook || !webhook.active) {
      await db
        .update(webhookDeliveriesTable)
        .set({ status: "failed", failedAt: new Date() })
        .where(eq(webhookDeliveriesTable.id, delivery.id));
      continue;
    }

    const body = JSON.stringify({
      event: delivery.event,
      agentId: delivery.agentId,
      data: delivery.payload,
      timestamp: new Date().toISOString(),
    });
    const signature = buildSignatureHeader(body, webhook.secret);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AgentID-Signature": signature,
          "X-AgentID-Event": delivery.event,
          "X-AgentID-Delivery": delivery.id,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseBody = await response.text().catch(() => "");

      if (response.ok) {
        await db
          .update(webhookDeliveriesTable)
          .set({
            status: "delivered",
            httpStatus: response.status,
            responseBody: responseBody.slice(0, 1000),
            deliveredAt: new Date(),
            attempts: (delivery.attempts || 0) + 1,
          })
          .where(eq(webhookDeliveriesTable.id, delivery.id));

        await db
          .update(agentWebhooksTable)
          .set({ consecutiveFailures: 0, lastDeliveryAt: new Date() })
          .where(eq(agentWebhooksTable.id, webhook.id));
      } else {
        await db
          .update(webhookDeliveriesTable)
          .set({ attempts: (delivery.attempts || 0) + 1 })
          .where(eq(webhookDeliveriesTable.id, delivery.id));
        await handleDeliveryFailure(webhook, delivery.id, response.status, responseBody);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db
        .update(webhookDeliveriesTable)
        .set({ attempts: (delivery.attempts || 0) + 1 })
        .where(eq(webhookDeliveriesTable.id, delivery.id));
      await handleDeliveryFailure(webhook, delivery.id, 0, message);
    }
  }
}
