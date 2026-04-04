/**
 * Entity factories/builders for integration tests.
 *
 * All factories write directly to the real test DB.
 * Use within a transaction (withTestTransaction) for automatic cleanup.
 */
import { randomBytes, createHash } from "crypto";
import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  agentKeysTable,
  apiKeysTable,
  agentVerificationChallengesTable,
  agentidSessionsTable,
  authNoncesTable,
  ownerTokensTable,
  type Agent,
  type User,
  type AgentKey,
  type ApiKey,
} from "@workspace/db/schema";
import { generateEd25519KeyPair } from "./crypto";

function uid(prefix = ""): string {
  return `${prefix}${randomBytes(8).toString("hex")}`;
}

/** Create a test user with a random provider ID */
export async function createTestUser(overrides: Partial<typeof usersTable.$inferInsert> = {}): Promise<User> {
  const [user] = await db.insert(usersTable).values({
    provider: "test",
    providerId: uid("test_"),
    displayName: `Test User ${uid()}`,
    email: `test-${uid()}@test-agentid.invalid`,
    ...overrides,
  }).returning();
  return user;
}

/** Create a test agent with a real user as owner */
export async function createTestAgent(
  userId: string,
  overrides: Partial<typeof agentsTable.$inferInsert> = {},
): Promise<Agent> {
  const handle = overrides.handle ?? `test-agent-${uid()}`;
  const [agent] = await db.insert(agentsTable).values({
    userId,
    handle,
    displayName: `Test Agent ${uid()}`,
    status: "active",
    verificationStatus: "verified",
    trustTier: "basic",
    isPublic: false,
    ...overrides,
  }).returning();
  return agent;
}

/** Create a pending-verification agent (freshly registered, not yet verified) */
export async function createPendingAgent(
  userId: string,
  overrides: Partial<typeof agentsTable.$inferInsert> = {},
): Promise<Agent> {
  return createTestAgent(userId, {
    handle: `pending-${uid()}`,
    status: "pending_verification",
    verificationStatus: "pending",
    ...overrides,
  });
}

/** Create a revoked agent */
export async function createRevokedAgent(userId: string): Promise<Agent> {
  return createTestAgent(userId, {
    handle: `revoked-${uid()}`,
    status: "revoked",
    verificationStatus: "verified",
    revokedAt: new Date(),
    revocationReason: "test",
  });
}

/** Create a suspended agent */
export async function createSuspendedAgent(userId: string): Promise<Agent> {
  return createTestAgent(userId, {
    handle: `suspended-${uid()}`,
    status: "suspended",
    verificationStatus: "verified",
  });
}

export interface AgentKeyResult {
  agentKey: AgentKey;
  publicKeyB64: string;
  privateKeyB64: string;
}

/** Create a real Ed25519 agent key for a given agent */
export async function createTestAgentKey(agentId: string): Promise<AgentKeyResult> {
  const { publicKeyB64, privateKeyB64 } = generateEd25519KeyPair();
  const kid = `kid_${uid()}`;

  const [agentKey] = await db.insert(agentKeysTable).values({
    agentId,
    kid,
    keyType: "ed25519",
    publicKey: publicKeyB64,
    status: "active",
  }).returning();

  return { agentKey, publicKeyB64, privateKeyB64 };
}

export interface ApiKeyResult {
  apiKey: ApiKey;
  rawKey: string;
}

/** Create a test agent API key (X-Agent-Key strategy) */
export async function createTestAgentApiKey(agentId: string, overrides: Partial<typeof apiKeysTable.$inferInsert> = {}): Promise<ApiKeyResult> {
  const rawKeyBytes = randomBytes(32);
  const rawKey = `agk_${rawKeyBytes.toString("base64url")}`;
  const hashedKey = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = `agk_${rawKeyBytes.toString("base64url").slice(0, 8)}`;

  const [apiKey] = await db.insert(apiKeysTable).values({
    ownerType: "agent",
    ownerId: agentId,
    name: "test-key",
    keyPrefix,
    hashedKey,
    scopes: [],
    ...overrides,
  }).returning();

  return { apiKey, rawKey };
}

/** Create a test user API key (aid_ prefix) */
export async function createTestUserApiKey(userId: string): Promise<ApiKeyResult> {
  const rawKeyBytes = randomBytes(32);
  const rawKey = `aid_${rawKeyBytes.toString("base64url")}`;
  const hashedKey = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = `aid_${rawKeyBytes.toString("base64url").slice(0, 8)}`;

  const [apiKey] = await db.insert(apiKeysTable).values({
    ownerType: "user",
    ownerId: userId,
    name: "test-user-key",
    keyPrefix,
    hashedKey,
    scopes: [],
  }).returning();

  return { apiKey, rawKey };
}

/** Create a verification challenge for an agent */
export async function createTestChallenge(agentId: string, expiresInMs = 10 * 60 * 1000) {
  const challenge = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInMs);

  const [entry] = await db.insert(agentVerificationChallengesTable).values({
    agentId,
    challenge,
    method: "key_challenge",
    expiresAt,
  }).returning();

  return entry;
}

/** Create an expired verification challenge for an agent */
export async function createExpiredChallenge(agentId: string) {
  const challenge = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() - 1000);

  const [entry] = await db.insert(agentVerificationChallengesTable).values({
    agentId,
    challenge,
    method: "key_challenge",
    expiresAt,
  }).returning();

  return entry;
}

/** Create an auth nonce for a given agent */
export async function createTestNonce(agentId: string, audience?: string, expiresInMs = 5 * 60 * 1000) {
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInMs);

  const [entry] = await db.insert(authNoncesTable).values({
    nonce,
    agentId,
    audience: audience || null,
    expiresAt,
  }).returning();

  return entry;
}

/** Create an expired auth nonce */
export async function createExpiredNonce(agentId: string) {
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() - 1000);

  const [entry] = await db.insert(authNoncesTable).values({
    nonce,
    agentId,
    audience: null,
    expiresAt,
  }).returning();

  return entry;
}

/** Create an already-consumed auth nonce */
export async function createConsumedNonce(agentId: string) {
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const [entry] = await db.insert(authNoncesTable).values({
    nonce,
    agentId,
    audience: null,
    expiresAt,
    consumedAt: new Date(),
  }).returning();

  return entry;
}

/** Create an active session for an agent */
export async function createTestSession(agentId: string, overrides: Partial<typeof agentidSessionsTable.$inferInsert> = {}) {
  const sessionId = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const [session] = await db.insert(agentidSessionsTable).values({
    sessionId,
    agentId,
    expiresAt,
    revoked: false,
    scopes: ["agents:read"],
    trustTier: "basic",
    verificationStatus: "verified",
    issuedAt: new Date(),
    ...overrides,
  }).returning();

  return session;
}

/** Create an owner token for a user.
 *
 * The DB stores only the SHA-256 hash of the token (matching runtime behaviour).
 * The returned object includes `rawToken` for use in API calls and
 * `token` (the hash) for direct DB lookups.
 */
export async function createTestOwnerToken(userId: string, expiresInMs = 24 * 60 * 60 * 1000) {
  const rawToken = `aid_${randomBytes(16).toString("hex")}`;
  const hashedToken = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + expiresInMs);

  const [entry] = await db.insert(ownerTokensTable).values({
    token: hashedToken,
    userId,
    used: false,
    expiresAt,
  }).returning();

  return { ...entry, rawToken };
}
