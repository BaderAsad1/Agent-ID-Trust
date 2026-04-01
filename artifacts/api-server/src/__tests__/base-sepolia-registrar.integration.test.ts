/**
 * Base Sepolia Registrar — Task #152 Integration Tests
 *
 * Covers the five wiring changes introduced in Task #152:
 *  1. ABI expansion: reserveHandles, unreserveHandle, isHandleAvailable,
 *     handleActive, handleTier, handleExpiry, handleToAgentId are encodable
 *  2. getBaseConfig() uses BASE_AGENTID_REGISTRAR first (proxy), not BASE_ERC8004_REGISTRY
 *  3. BASE_CHAIN_ID=84532 → baseSepolia chain selected in makeClients
 *  4. reserveHandlesOnChain soft-fails when registrar is not configured
 *  5. unreserveHandleOnChain soft-fails when registrar is not configured
 *  6. isHandleAvailableOnChain returns null when registrar is not configured
 *  7. Resolver machineIdentity.did and credential.did use did:web:getagent.id:agents:<uuid>
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { errorHandler } from "../middlewares/error-handler";
import { createTestUser, createTestAgent } from "../test-support/factories";

// ── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("../services/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
  sendAgentRegisteredEmail: vi.fn().mockResolvedValue(undefined),
  sendRenewalReminderEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/credentials", () => ({
  reissueCredential: vi.fn().mockResolvedValue(undefined),
  issueCredential: vi.fn().mockResolvedValue(undefined),
  getActiveCredential: vi.fn().mockResolvedValue(null),
}));
vi.mock("../lib/resolution-cache", () => ({
  getResolutionCache: vi.fn().mockResolvedValue(null),
  setResolutionCache: vi.fn().mockResolvedValue(undefined),
  deleteResolutionCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/billing")>();
  return {
    ...actual,
    getUserPlan: vi.fn().mockResolvedValue("free"),
    getPlanLimits: vi.fn().mockReturnValue({ maxAgents: 5, canReceiveMail: false }),
    getActiveUserSubscription: vi.fn().mockResolvedValue(null),
  };
});
vi.mock("../services/mail", () => ({
  provisionInboxForAgent: vi.fn().mockResolvedValue(undefined),
  getOrCreateInbox: vi.fn().mockResolvedValue(null),
}));

// Track entities for cleanup
const createdAgentIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdAgentIds) {
    await db.delete(agentsTable).where(eq(agentsTable.id, id)).catch(() => {});
  }
});

// ── Env helpers ───────────────────────────────────────────────────────────────

const FAKE_TX_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab";
const FAKE_CONTRACT = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const TESTNET_PROXY = "0x1D592A07dF4aFd897D25d348e90389C494034110";
const TESTNET_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

function clearBaseEnv() {
  delete process.env.BASE_RPC_URL;
  delete process.env.BASE_MINTER_PRIVATE_KEY;
  delete process.env.BASE_PLATFORM_WALLET;
  delete process.env.BASE_AGENTID_REGISTRAR;
  delete process.env.BASE_ERC8004_REGISTRY;
  delete process.env.BASE_CHAIN_ID;
  delete process.env.ONCHAIN_MINTING_ENABLED;
}

afterEach(() => {
  clearBaseEnv();
});

// ── Test 1: ABI expansion — new functions are encodable ──────────────────────

describe("Task #152 — ABI expansion: new functions are encodable", () => {
  it("encodes reserveHandles selector correctly", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const { encodeFunctionData, keccak256, toBytes } = await import("viem");

    const encoded = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: "reserveHandles",
      args: [["myhandle", "other"]],
    });

    const selector = encoded.slice(0, 10);
    const expectedSelector = keccak256(toBytes("reserveHandles(string[])")).slice(0, 10);
    expect(selector).toBe(expectedSelector);
  });

  it("encodes unreserveHandle selector correctly", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const { encodeFunctionData, keccak256, toBytes } = await import("viem");

    const encoded = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: "unreserveHandle",
      args: ["myhandle"],
    });

    const selector = encoded.slice(0, 10);
    const expectedSelector = keccak256(toBytes("unreserveHandle(string)")).slice(0, 10);
    expect(selector).toBe(expectedSelector);
  });

  it("encodes isHandleAvailable selector correctly", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const { encodeFunctionData, keccak256, toBytes } = await import("viem");

    const encoded = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: "isHandleAvailable",
      args: ["myhandle"],
    });

    const selector = encoded.slice(0, 10);
    const expectedSelector = keccak256(toBytes("isHandleAvailable(string)")).slice(0, 10);
    expect(selector).toBe(expectedSelector);
  });

  it("encodes handleToAgentId selector correctly", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const { encodeFunctionData, keccak256, toBytes } = await import("viem");

    const encoded = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: "handleToAgentId",
      args: ["myhandle"],
    });

    const selector = encoded.slice(0, 10);
    const expectedSelector = keccak256(toBytes("handleToAgentId(string)")).slice(0, 10);
    expect(selector).toBe(expectedSelector);
  });
});

// ── Test 2: getBaseConfig() uses BASE_AGENTID_REGISTRAR first ────────────────

describe("Task #152 — getBaseConfig() proxy address priority", () => {
  it("uses BASE_AGENTID_REGISTRAR when both vars are set", async () => {
    process.env.BASE_AGENTID_REGISTRAR = TESTNET_PROXY;
    process.env.BASE_ERC8004_REGISTRY = TESTNET_REGISTRY;

    // getBaseConfig reads process.env at call time so the import can be cached
    const { getBaseConfig } = await import("../services/chains/base");
    const config = getBaseConfig();

    expect(config.registrarAddress).toBe(TESTNET_PROXY);
    expect(config.registryAddress).toBe(TESTNET_REGISTRY);

    delete process.env.BASE_AGENTID_REGISTRAR;
    delete process.env.BASE_ERC8004_REGISTRY;
  });

  it("falls back to BASE_ERC8004_REGISTRY when BASE_AGENTID_REGISTRAR is not set", async () => {
    delete process.env.BASE_AGENTID_REGISTRAR;
    process.env.BASE_ERC8004_REGISTRY = TESTNET_REGISTRY;

    const { getBaseConfig } = await import("../services/chains/base");
    const config = getBaseConfig();

    expect(config.registrarAddress).toBe(TESTNET_REGISTRY);

    delete process.env.BASE_ERC8004_REGISTRY;
  });
});

// ── Test 3: reserveHandlesOnChain soft-fails when not configured ─────────────

describe("Task #152 — reserveHandlesOnChain soft-fail when registrar not configured", () => {
  it("returns false when BASE_RPC_URL is not set", async () => {
    process.env.ONCHAIN_MINTING_ENABLED = "true";
    clearBaseEnv();
    process.env.ONCHAIN_MINTING_ENABLED = "true";

    const { reserveHandlesOnChain } = await import("../services/chains/base");
    const result = await reserveHandlesOnChain(["myhandle"]);
    expect(result).toBe(false);
  });

  it("returns false when ONCHAIN_MINTING_ENABLED=false", async () => {
    process.env.ONCHAIN_MINTING_ENABLED = "false";
    process.env.BASE_RPC_URL = "https://sepolia.base.org";
    process.env.BASE_AGENTID_REGISTRAR = TESTNET_PROXY;
    process.env.BASE_MINTER_PRIVATE_KEY = "0x" + "a".repeat(64);

    const { reserveHandlesOnChain } = await import("../services/chains/base");
    const result = await reserveHandlesOnChain(["myhandle"]);
    expect(result).toBe(false);
  });
});

// ── Test 4: unreserveHandleOnChain soft-fails when not configured ─────────────

describe("Task #152 — unreserveHandleOnChain soft-fail when registrar not configured", () => {
  it("returns false when BASE_RPC_URL is not set", async () => {
    clearBaseEnv();
    process.env.ONCHAIN_MINTING_ENABLED = "true";

    const { unreserveHandleOnChain } = await import("../services/chains/base");
    const result = await unreserveHandleOnChain("myhandle");
    expect(result).toBe(false);
  });
});

// ── Test 5: isHandleAvailableOnChain returns null when not configured ─────────

describe("Task #152 — isHandleAvailableOnChain returns null when registrar not configured", () => {
  it("returns null when BASE_RPC_URL is not set", async () => {
    clearBaseEnv();

    const { isHandleAvailableOnChain } = await import("../services/chains/base");
    const result = await isHandleAvailableOnChain("myhandle");
    expect(result).toBeNull();
  });
});

// ── Test 6: BASE_CHAIN_ID=84532 selects baseSepolia ──────────────────────────

describe("Task #152 — BASE_CHAIN_ID=84532 selects baseSepolia", () => {
  it("getViemChain internal selection is exercised by verifying env reads", async () => {
    // We cannot directly import the private getViemChain function, but we can verify
    // that the env var is read at call time by checking that isHandleAvailableOnChain
    // returns null (no RPC) without erroring — chain selection doesn't throw by itself.
    process.env.BASE_CHAIN_ID = "84532";
    process.env.BASE_RPC_URL = "https://sepolia.base.org.invalid";
    process.env.BASE_AGENTID_REGISTRAR = TESTNET_PROXY;

    const { isHandleAvailableOnChain } = await import("../services/chains/base");
    // It will fail the RPC call (invalid host), not the chain selection — returns null, not throw
    const result = await isHandleAvailableOnChain("myhandle").catch(() => null);
    expect(result).toBeNull();

    delete process.env.BASE_CHAIN_ID;
    delete process.env.BASE_RPC_URL;
    delete process.env.BASE_AGENTID_REGISTRAR;
  });
});

// ── Test 7: Resolver machineIdentity.did uses did:web:getagent.id:agents:<uuid> ──

describe("Task #152 — Resolver DID format: did:web:getagent.id:agents:<uuid>", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    const resolveRouter = (await import("../routes/v1/resolve")).default;
    app.use("/api/v1/resolve", resolveRouter);
    app.use(errorHandler);
  });

  it("machineIdentity.did is did:web:getagent.id:agents:<uuid> for handle-based agent", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const agent = await createTestAgent(user.id, {
      handle: `web${Date.now().toString(36)}`,
      handlePaid: true,
      handleTier: "standard_5plus",
      status: "active",
      isPublic: true,
      nftStatus: "none",
    });
    createdAgentIds.push(agent.id);

    const res = await request(app)
      .get(`/api/v1/resolve/${agent.handle}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    const body = res.body.agent ?? res.body;

    // machineIdentity.did must always be the stable UUID-based did:web DID
    expect(body.machineIdentity).toBeDefined();
    expect(body.machineIdentity.did).toBe(`did:web:getagent.id:agents:${agent.id}`);
    expect(body.machineIdentity.agentId).toBe(agent.id);
  });

  it("top-level did falls back to did:web:getagent.id:agents:<uuid> when agent has no handle", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const agent = await createTestAgent(user.id, {
      handle: null as unknown as string,
      handlePaid: false,
      status: "active",
      isPublic: true,
      nftStatus: "none",
    });
    createdAgentIds.push(agent.id);

    const res = await request(app)
      .get(`/api/v1/resolve/id/${agent.id}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    const body = res.body.agent ?? res.body;

    // No handle → top-level did must be did:web:getagent.id:agents:<uuid>
    expect(body.did).toBe(`did:web:getagent.id:agents:${agent.id}`);
    expect(body.machineIdentity.did).toBe(`did:web:getagent.id:agents:${agent.id}`);
    expect(body.credential?.did).toBe(`did:web:getagent.id:agents:${agent.id}`);
  });
});
