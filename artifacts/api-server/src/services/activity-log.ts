import { createHash, createHmac, randomBytes } from "crypto";
import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentSignedActivityTable } from "@workspace/db/schema";
import { env } from "../lib/env";

function getSigningSecret(): string {
  const config = env();
  const secret = config.ACTIVITY_HMAC_SECRET;
  if (!secret) {
    if (config.NODE_ENV === "production") {
      throw new Error("ACTIVITY_HMAC_SECRET is required in production for signed activity log.");
    }
    return randomBytes(32).toString("hex");
  }
  return secret;
}

let signingSecret: string | null = null;
function secret(): string {
  if (!signingSecret) signingSecret = getSigningSecret();
  return signingSecret;
}

function computeHash(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function computeSignature(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("hex");
}

const PUBLIC_EVENT_TYPES = new Set([
  "agent.created",
  "agent.verified",
  "agent.trust_updated",
  "agent.task_completed",
  "agent.attestation_received",
  "agent.key_rotated",
]);

export interface LogSignedActivityInput {
  agentId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  isPublic?: boolean;
}

export async function logSignedActivity(input: LogSignedActivityInput) {
  const lastEntry = await db.query.agentSignedActivityTable.findFirst({
    where: eq(agentSignedActivityTable.agentId, input.agentId),
    orderBy: [desc(agentSignedActivityTable.sequenceNumber)],
    columns: { sequenceNumber: true, currentHash: true },
  });

  const sequenceNumber = (lastEntry?.sequenceNumber ?? 0) + 1;
  const previousHash = lastEntry?.currentHash ?? null;

  const entryData = JSON.stringify({
    agentId: input.agentId,
    sequenceNumber,
    eventType: input.eventType,
    payload: input.payload || {},
    previousHash,
    timestamp: new Date().toISOString(),
  });

  const currentHash = computeHash(entryData);
  const signature = computeSignature(entryData);
  const isPublic = input.isPublic !== undefined
    ? (input.isPublic ? "true" : "false")
    : (PUBLIC_EVENT_TYPES.has(input.eventType) ? "true" : "false");

  const [entry] = await db
    .insert(agentSignedActivityTable)
    .values({
      agentId: input.agentId,
      sequenceNumber,
      eventType: input.eventType,
      payload: input.payload || {},
      previousHash,
      currentHash,
      signature,
      isPublic,
    })
    .returning();

  return entry;
}

export async function getSignedActivityLog(
  agentId: string,
  limit = 50,
  offset = 0,
) {
  return db.query.agentSignedActivityTable.findMany({
    where: eq(agentSignedActivityTable.agentId, agentId),
    orderBy: [desc(agentSignedActivityTable.sequenceNumber)],
    limit,
    offset,
  });
}

export async function getPublicSignedActivityLog(
  agentId: string,
  limit = 50,
  offset = 0,
) {
  return db.query.agentSignedActivityTable.findMany({
    where: and(
      eq(agentSignedActivityTable.agentId, agentId),
      eq(agentSignedActivityTable.isPublic, "true"),
    ),
    orderBy: [desc(agentSignedActivityTable.sequenceNumber)],
    limit,
    offset,
  });
}

export async function verifyActivityChain(agentId: string): Promise<{
  valid: boolean;
  entries: number;
  brokenAt?: number;
}> {
  const entries = await db.query.agentSignedActivityTable.findMany({
    where: eq(agentSignedActivityTable.agentId, agentId),
    orderBy: [agentSignedActivityTable.sequenceNumber],
  });

  if (entries.length === 0) return { valid: true, entries: 0 };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (i === 0) {
      if (entry.previousHash !== null) {
        return { valid: false, entries: entries.length, brokenAt: entry.sequenceNumber };
      }
    } else {
      if (entry.previousHash !== entries[i - 1].currentHash) {
        return { valid: false, entries: entries.length, brokenAt: entry.sequenceNumber };
      }
    }
  }

  return { valid: true, entries: entries.length };
}
