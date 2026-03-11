import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentKeysTable, type AgentKey } from "@workspace/db/schema";

export interface CreateAgentKeyInput {
  agentId: string;
  keyType: string;
  publicKey?: string;
  jwk?: unknown;
  use?: string;
}

function generateKid(): string {
  return `kid_${randomBytes(12).toString("hex")}`;
}

export async function createAgentKey(
  input: CreateAgentKeyInput,
): Promise<AgentKey> {
  const kid = generateKid();

  const [key] = await db
    .insert(agentKeysTable)
    .values({
      agentId: input.agentId,
      kid,
      keyType: input.keyType,
      publicKey: input.publicKey,
      jwk: input.jwk,
      use: input.use || "sig",
    })
    .returning();

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
