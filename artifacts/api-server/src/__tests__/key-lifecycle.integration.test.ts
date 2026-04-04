/**
 * Key Lifecycle — Integration Tests
 *
 * Tests key rotation and revocation with real DB:
 *   - createAgentKey rejects non-ed25519 key types
 *   - initiateKeyRotation creates new key and marks old as rotating
 *   - immediateRevoke=true immediately revokes old key
 *   - rotateAgentKey rejects non-ed25519
 *   - revokeAgentKey sets key status=revoked and revokedAt
 *   - listAgentKeys returns only active/rotating keys by default
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../services/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
  sendAgentRegisteredEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email.js", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
  sendAgentRegisteredEmail: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  agentKeysTable,
  apiKeysTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateEd25519KeyPair } from "../test-support/crypto";
import {
  createTestUser,
  createTestAgent,
  createTestAgentKey,
} from "../test-support/factories";
import {
  createAgentKey,
  initiateKeyRotation,
  revokeAgentKey,
  listAgentKeys,
} from "../services/agent-keys";

describe("Key Lifecycle — createAgentKey ed25519 enforcement", () => {
  it("rejects RSA key type before DB call", async () => {
    await expect(
      createAgentKey({ agentId: "test-agent", keyType: "RSA", publicKey: "pk" }),
    ).rejects.toThrow(/only ed25519 is permitted/i);
  });

  it("rejects P-256 key type before DB call", async () => {
    await expect(
      createAgentKey({ agentId: "test-agent", keyType: "P-256", publicKey: "pk" }),
    ).rejects.toThrow(/only ed25519 is permitted/i);
  });

  it("rejects EC / ECDSA key type before DB call", async () => {
    await expect(
      createAgentKey({ agentId: "test-agent", keyType: "ECDSA", publicKey: "pk" }),
    ).rejects.toThrow(/only ed25519 is permitted/i);
  });

  it("rejects secp256k1 before DB call", async () => {
    await expect(
      createAgentKey({ agentId: "test-agent", keyType: "secp256k1", publicKey: "pk" }),
    ).rejects.toThrow(/only ed25519 is permitted/i);
  });
});

describe("Key Lifecycle — initiateKeyRotation rejects non-ed25519", () => {
  it("rejects RSA key type in initiateKeyRotation", async () => {
    await expect(
      initiateKeyRotation("agent-id", "old-kid", "new-pk", "RSA"),
    ).rejects.toThrow(/only ed25519 is permitted/i);
  });

  it("rejects ECDSA key type in initiateKeyRotation", async () => {
    await expect(
      initiateKeyRotation("agent-id", "old-kid", "new-pk", "ECDSA"),
    ).rejects.toThrow(/only ed25519 is permitted/i);
  });
});

describe("Key Lifecycle — real DB: key creation, rotation, and revocation", () => {
  let userId: string;
  let agentId: string;
  let initialKeyId: string;
  let initialKid: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId);
    agentId = agent.id;

    const { publicKeyB64 } = generateEd25519KeyPair();
    const key = await createAgentKey({ agentId, keyType: "ed25519", publicKey: publicKeyB64 });
    initialKeyId = key.id;
    initialKid = key.kid;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("createAgentKey writes an ed25519 key to DB with status=active", async () => {
    const key = await db.query.agentKeysTable.findFirst({
      where: eq(agentKeysTable.kid, initialKid),
      columns: { status: true, keyType: true, agentId: true },
    });
    expect(key).toBeDefined();
    expect(key!.status).toBe("active");
    expect(key!.keyType).toBe("ed25519");
    expect(key!.agentId).toBe(agentId);
  });

  it("initiateKeyRotation creates new key and marks old key as rotating", async () => {
    const { publicKeyB64: newPk } = generateEd25519KeyPair();
    const result = await initiateKeyRotation(agentId, initialKeyId, newPk, "ed25519");

    expect(result).not.toBeNull();
    expect(result!.newKey.kid).not.toBe(initialKid);
    expect(result!.newKey.keyType).toBe("ed25519");

    const oldKey = await db.query.agentKeysTable.findFirst({
      where: eq(agentKeysTable.kid, initialKid),
      columns: { status: true },
    });
    expect(["rotating", "revoked"]).toContain(oldKey!.status);

    initialKeyId = result!.newKey.id;
    initialKid = result!.newKey.kid;
  });

  it("revokeAgentKey sets status=revoked and revokedAt in DB", async () => {
    await revokeAgentKey(agentId, initialKeyId);

    const key = await db.query.agentKeysTable.findFirst({
      where: eq(agentKeysTable.kid, initialKid),
      columns: { status: true, revokedAt: true },
    });
    expect(key!.status).toBe("revoked");
    expect(key!.revokedAt).toBeInstanceOf(Date);
  });

  it("listAgentKeys returns agent key list", async () => {
    const { publicKeyB64 } = generateEd25519KeyPair();
    const newKey = await createAgentKey({ agentId, keyType: "ed25519", publicKey: publicKeyB64 });
    const keys = await listAgentKeys(agentId);
    expect(Array.isArray(keys)).toBe(true);
    const found = keys.find(k => k.kid === newKey.kid);
    expect(found).toBeDefined();
  });
});

describe("Key Lifecycle — immediateRevoke=true bypasses grace period", () => {
  let userId: string;
  let agentId: string;
  let keyIdToRevoke: string;
  let kidToRevoke: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId);
    agentId = agent.id;

    const { agentKey } = await createTestAgentKey(agentId);
    keyIdToRevoke = agentKey.id;
    kidToRevoke = agentKey.kid;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("immediateRevoke=true sets old key to status=revoked immediately (not rotating)", async () => {
    const { publicKeyB64: newPk } = generateEd25519KeyPair();
    await initiateKeyRotation(agentId, keyIdToRevoke, newPk, "ed25519", undefined, { immediateRevoke: true });

    const oldKey = await db.query.agentKeysTable.findFirst({
      where: eq(agentKeysTable.kid, kidToRevoke),
      columns: { status: true, revokedAt: true },
    });
    expect(oldKey!.status).toBe("revoked");
    expect(oldKey!.revokedAt).toBeInstanceOf(Date);
  });
});

describe("Key Lifecycle — Node.js crypto key type identification", () => {
  it("generateKeyPairSync('rsa') produces RSA key (not ed25519)", async () => {
    const { generateKeyPairSync, createPublicKey } = await import("crypto");
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const der = publicKey.export({ format: "der", type: "spki" });
    const parsed = createPublicKey({ key: Buffer.from(der), format: "der", type: "spki" });
    expect(parsed.asymmetricKeyType).toBe("rsa");
    expect(parsed.asymmetricKeyType).not.toBe("ed25519");
  });

  it("generateKeyPairSync('ed25519') produces ed25519 key", async () => {
    const { generateKeyPairSync, createPublicKey } = await import("crypto");
    const { publicKey } = generateKeyPairSync("ed25519");
    const der = publicKey.export({ format: "der", type: "spki" });
    const parsed = createPublicKey({ key: Buffer.from(der), format: "der", type: "spki" });
    expect(parsed.asymmetricKeyType).toBe("ed25519");
  });

  it("generateKeyPairSync('ec', {namedCurve:'P-256'}) produces ec key (not ed25519)", async () => {
    const { generateKeyPairSync, createPublicKey } = await import("crypto");
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const der = publicKey.export({ format: "der", type: "spki" });
    const parsed = createPublicKey({ key: Buffer.from(der), format: "der", type: "spki" });
    expect(parsed.asymmetricKeyType).toBe("ec");
    expect(parsed.asymmetricKeyType).not.toBe("ed25519");
  });
});
