import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentActivityLogTable } from "@workspace/db/schema";
import { env } from "../lib/env";

function getHmacSecret(): string {
  const config = env();
  const secret = config.ACTIVITY_HMAC_SECRET;
  if (!secret) {
    if (config.NODE_ENV === "production") {
      throw new Error(
        "ACTIVITY_HMAC_SECRET is required in production. " +
        "Activity-log signatures must be durable across restarts.",
      );
    }
    return randomBytes(32).toString("hex");
  }
  return secret;
}

const HMAC_SECRET = getHmacSecret();

export type ActivityEventType =
  | "agent.created"
  | "agent.updated"
  | "agent.deleted"
  | "agent.verified"
  | "agent.verification_failed"
  | "agent.endpoint_updated"
  | "agent.key_created"
  | "agent.key_rotated"
  | "agent.key_revoked"
  | "agent.task_received"
  | "agent.task_delivered"
  | "agent.task_acknowledged"
  | "agent.task_completed"
  | "agent.listing_created"
  | "agent.listing_updated"
  | "agent.profile_viewed"
  | "agent.trust_updated"
  | "agent.status_changed"
  | "agent.programmatic_registered"
  | "agent.domain_provisioned"
  | "agent.domain_provisioning_started"
  | "agent.domain_provisioning_failed"
  | "agent.domain_reprovisioned"
  | "agent.domain_deprovisioned"
  | "agent.proposal_submitted"
  | "agent.proposal_accepted"
  | "agent.proposal_rejected"
  | "agent.job_created"
  | "agent.job_status_changed"
  | "agent.job_expired"
  | "agent.inbox_created"
  | "agent.message_received"
  | "agent.message_sent"
  | "agent.message_converted_to_task"
  | "agent.webhook_created"
  | "agent.webhook_deleted"
  | "agent.spawned"
  | "agent.spawned_child"
  | "agent.terminated"
  | "agent.handle_transferred"
  | "agent.sub_handle_created"
  | "agent.sub_handle_deleted"
  | "transfer.created"
  | "transfer.readiness_report_generated"
  | "transfer.hold_funded"
  | "transfer.trust_snapshotted"
  | "transfer.handoff_started"
  | "transfer.handoff_completed"
  | "transfer.trust_recalibrated"
  | "transfer.keys_rotated"
  | "transfer.operator_changed"
  | "transfer.dispute_raised"
  | "transfer.dispute_resolved"
  | "transfer.cancelled"
  | "agent.heartbeat";

interface LogEventInput {
  agentId: string;
  eventType: ActivityEventType;
  payload?: Record<string, unknown>;
  ipAddress?: string | string[];
  userAgent?: string | string[];
}

function computeSignature(
  agentId: string,
  eventType: string,
  payload: unknown,
  timestamp: string,
): string {
  const data = JSON.stringify({ agentId, eventType, payload, timestamp });
  return createHmac("sha256", HMAC_SECRET).update(data).digest("hex");
}

export async function logActivity(input: LogEventInput) {
  const timestamp = new Date().toISOString();
  const enrichedPayload = {
    ...(input.payload || {}),
    _signedAt: timestamp,
  };

  const signature = computeSignature(
    input.agentId,
    input.eventType,
    enrichedPayload,
    timestamp,
  );

  const [entry] = await db
    .insert(agentActivityLogTable)
    .values({
      agentId: input.agentId,
      eventType: input.eventType,
      payload: enrichedPayload,
      signature,
      ipAddress: Array.isArray(input.ipAddress)
        ? input.ipAddress[0]
        : input.ipAddress,
      userAgent: Array.isArray(input.userAgent)
        ? input.userAgent[0]
        : input.userAgent,
    })
    .returning();

  return entry;
}

export async function getActivityLog(
  agentId: string,
  limit = 50,
  offset = 0,
) {
  return db.query.agentActivityLogTable.findMany({
    where: eq(agentActivityLogTable.agentId, agentId),
    orderBy: [desc(agentActivityLogTable.createdAt)],
    limit,
    offset,
  });
}

export function verifySignature(
  agentId: string,
  eventType: string,
  payload: Record<string, unknown>,
  signature: string,
): boolean {
  const signedAt = payload._signedAt as string | undefined;
  if (!signedAt) return false;

  const expected = computeSignature(agentId, eventType, payload, signedAt);
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
