import { randomBytes, createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { apiKeysTable, type ApiKey } from "@workspace/db/schema";

const KEY_PREFIX_LENGTH = 8;
const KEY_LENGTH = 32;

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateRawKey(): string {
  return randomBytes(KEY_LENGTH).toString("base64url");
}

export interface CreateApiKeyInput {
  ownerType: "user" | "agent";
  ownerId: string;
  name: string;
  scopes?: string[];
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  rawKey: string;
}

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  const rawKey = generateRawKey();
  const prefix = `aid_${rawKey.slice(0, KEY_PREFIX_LENGTH)}`;
  const fullKey = `${prefix}${rawKey.slice(KEY_PREFIX_LENGTH)}`;
  const hashedKey = hashKey(fullKey);

  const [apiKey] = await db
    .insert(apiKeysTable)
    .values({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      name: input.name,
      keyPrefix: prefix,
      hashedKey,
      scopes: input.scopes || [],
    })
    .returning();

  return { apiKey, rawKey: fullKey };
}

export async function listApiKeys(
  ownerType: "user" | "agent",
  ownerId: string,
): Promise<ApiKey[]> {
  return db.query.apiKeysTable.findMany({
    where: and(
      eq(apiKeysTable.ownerType, ownerType),
      eq(apiKeysTable.ownerId, ownerId),
      isNull(apiKeysTable.revokedAt),
    ),
    orderBy: (keys, { desc }) => [desc(keys.createdAt)],
  });
}

export async function revokeApiKey(
  keyId: string,
  ownerId: string,
): Promise<ApiKey | null> {
  const [updated] = await db
    .update(apiKeysTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeysTable.id, keyId),
        eq(apiKeysTable.ownerId, ownerId),
        isNull(apiKeysTable.revokedAt),
      ),
    )
    .returning();

  return updated || null;
}

export async function verifyApiKey(
  rawKey: string,
): Promise<ApiKey | null> {
  const prefix = rawKey.slice(0, 4 + KEY_PREFIX_LENGTH);
  const hashedKey = hashKey(rawKey);

  const key = await db.query.apiKeysTable.findFirst({
    where: and(
      eq(apiKeysTable.keyPrefix, prefix),
      eq(apiKeysTable.hashedKey, hashedKey),
      isNull(apiKeysTable.revokedAt),
    ),
  });

  if (!key) return null;

  await db
    .update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, key.id));

  return key;
}
