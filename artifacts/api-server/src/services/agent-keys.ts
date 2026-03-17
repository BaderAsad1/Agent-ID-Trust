import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { logger } from "../middlewares/request-logger";
import { db } from "@workspace/db";
import { agentKeysTable, agentsTable, usersTable, type AgentKey } from "@workspace/db/schema";

export interface CreateAgentKeyInput {
  agentId: string;
  keyType: string;
  publicKey?: string;
  jwk?: unknown;
  use?: string;
  purpose?: "signing" | "encryption" | "recovery" | "delegation";
  expiresAt?: Date;
  autoRotateDays?: number;
}

function generateKid(): string {
  return `kid_${randomBytes(12).toString("hex")}`;
}

export async function createAgentKey(
  input: CreateAgentKeyInput,
): Promise<AgentKey> {
  const kid = generateKid();

  if (input.purpose) {
    await db
      .update(agentKeysTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(
        and(
          eq(agentKeysTable.agentId, input.agentId),
          eq(agentKeysTable.purpose, input.purpose),
          eq(agentKeysTable.status, "active"),
        ),
      );
  }

  const [key] = await db
    .insert(agentKeysTable)
    .values({
      agentId: input.agentId,
      kid,
      keyType: input.keyType,
      publicKey: input.publicKey,
      jwk: input.jwk,
      use: input.use || "sig",
      purpose: input.purpose,
      expiresAt: input.expiresAt,
      autoRotateDays: input.autoRotateDays,
    })
    .returning();

  try {
    const agent = await db.query.agentsTable.findFirst({ where: eq(agentsTable.id, input.agentId) });
    if (agent) {
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, agent.userId) });
      if (user?.email) {
        const { sendCredentialIssuedEmail } = await import("./email");
        await sendCredentialIssuedEmail(user.email, agent.handle, input.keyType);
      }
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "[agent-keys] Failed to send credential email");
  }

  return key;
}

export async function listAgentKeys(agentId: string): Promise<AgentKey[]> {
  return db.query.agentKeysTable.findMany({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.status, "active"),
    ),
    orderBy: (keys, { desc }) => [desc(keys.createdAt)],
  });
}

export async function getAgentKeyByKid(
  agentId: string,
  kid: string,
): Promise<AgentKey | null> {
  const key = await db.query.agentKeysTable.findFirst({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.kid, kid),
    ),
  });
  return key ?? null;
}

export async function revokeAgentKey(
  agentId: string,
  keyId: string,
): Promise<AgentKey | null> {
  const [updated] = await db
    .update(agentKeysTable)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(
      and(
        eq(agentKeysTable.id, keyId),
        eq(agentKeysTable.agentId, agentId),
        eq(agentKeysTable.status, "active"),
      ),
    )
    .returning();

  return updated ?? null;
}

export async function rotateAgentKey(
  agentId: string,
  oldKeyId: string,
  newPublicKey: string,
  keyType: string = "ed25519",
): Promise<{ revokedKey: AgentKey; newKey: AgentKey } | null> {
  const revokedKey = await revokeAgentKey(agentId, oldKeyId);
  if (!revokedKey) {
    return null;
  }

  const newKey = await createAgentKey({
    agentId,
    keyType,
    publicKey: newPublicKey,
  });

  return { revokedKey, newKey };
}

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export async function initiateKeyRotation(
  agentId: string,
  oldKeyId: string,
  newPublicKey: string,
  keyType: string = "ed25519",
  reason?: string,
): Promise<{ oldKey: AgentKey; newKey: AgentKey; rotationLogId: string } | null> {
  const oldKey = await db.query.agentKeysTable.findFirst({
    where: and(
      eq(agentKeysTable.id, oldKeyId),
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.status, "active"),
    ),
  });

  if (!oldKey) return null;

  const newKey = await createAgentKey({
    agentId,
    keyType,
    publicKey: newPublicKey,
  });

  const expiresAt = new Date(Date.now() + GRACE_PERIOD_MS);

  await db
    .update(agentKeysTable)
    .set({
      status: "rotating",
      rotatedAt: new Date(),
      rotatedByKid: newKey.kid,
      expiresAt,
      rotationReason: reason,
    })
    .where(eq(agentKeysTable.id, oldKeyId));

  const { agentKeyRotationLogTable } = await import("@workspace/db/schema");

  const [rotationLog] = await db
    .insert(agentKeyRotationLogTable)
    .values({
      agentId,
      oldKeyId,
      newKeyId: newKey.id,
      rotationReason: reason,
      rotatedByKid: oldKey.kid,
      status: "pending",
    })
    .returning();

  const updatedOldKey = await db.query.agentKeysTable.findFirst({
    where: eq(agentKeysTable.id, oldKeyId),
  });

  return { oldKey: updatedOldKey!, newKey, rotationLogId: rotationLog.id };
}

export async function verifyKeyRotation(
  agentId: string,
  rotationLogId: string,
): Promise<{ success: boolean; message: string }> {
  const { agentKeyRotationLogTable } = await import("@workspace/db/schema");

  const rotationLog = await db.query.agentKeyRotationLogTable.findFirst({
    where: and(
      eq(agentKeyRotationLogTable.id, rotationLogId),
      eq(agentKeyRotationLogTable.agentId, agentId),
      eq(agentKeyRotationLogTable.status, "pending"),
    ),
  });

  if (!rotationLog) {
    return { success: false, message: "Rotation log not found or already verified" };
  }

  await db
    .update(agentKeysTable)
    .set({
      status: "revoked",
      revokedAt: new Date(),
    })
    .where(eq(agentKeysTable.id, rotationLog.oldKeyId));

  await db
    .update(agentKeyRotationLogTable)
    .set({
      status: "verified",
      verifiedAt: new Date(),
    })
    .where(eq(agentKeyRotationLogTable.id, rotationLogId));

  return { success: true, message: "Key rotation verified. Old key has been revoked." };
}

export async function getRotatingKey(
  agentId: string,
  hashedKey: string,
): Promise<AgentKey | null> {
  const keys = await db.query.agentKeysTable.findMany({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.status, "rotating"),
    ),
  });

  for (const key of keys) {
    if (key.expiresAt && key.expiresAt > new Date()) {
      return key;
    }
  }

  return null;
}
