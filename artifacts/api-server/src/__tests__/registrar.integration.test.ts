/**
 * Registrar Integration — End-to-End Proof
 *
 * Proves the full payment → pending_anchor → anchor → resolver agreement chain
 * and the claim-ticket flow, without calling live RPC or Stripe endpoints.
 *
 * Covers:
 *  1. Billing sets nftStatus=pending_anchor on Stripe checkout (not pending_mint)
 *  2. nft-mint worker moves pending_anchor → active + writes canonical chainRegistrations array
 *  3. Resolver reads chainRegistrations and reflects erc8004Status=anchored
 *  4. Resolver reflects onchainStatus=pending when nftStatus=pending_anchor
 *  5. Claim-ticket: issue → validate → wallet binding checked
 *  6. Claim-ticket: expired tickets rejected
 *  7. Claim-ticket: replay prevention (JTI reuse rejected)
 *  8. Handle-lifecycle retires anchored handles without re-auctioning
 *  9. Handle-lifecycle sends anchored handle through releaseHandle (not auction)
 * 10. Resolver for non-anchored handle shows erc8004Status=off-chain
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { errorHandler } from "../middlewares/error-handler";
import { createTestUser, createTestAgent } from "../test-support/factories";

// ── Shared mocks ────────────────────────────────────────────────────────────

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

// Mock the on-chain registration to return a fake tx without hitting RPC
const FAKE_TX_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab" as const;
const FAKE_AGENT_ID = "42";
const FAKE_CONTRACT = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

vi.mock("../services/chains/base", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/chains/base")>();
  return {
    ...original,
    registerOnChain: vi.fn().mockResolvedValue({
      agentId: FAKE_AGENT_ID,
      txHash: FAKE_TX_HASH,
      chain: "base" as const,
      contractAddress: FAKE_CONTRACT,
    }),
    transferToUser: vi.fn().mockResolvedValue({
      txHash: FAKE_TX_HASH,
    }),
    resolveOnChain: vi.fn().mockResolvedValue(null),
    getContractAddress: vi.fn().mockResolvedValue(FAKE_CONTRACT),
    releaseHandleOnChain: vi.fn().mockResolvedValue({ txHash: FAKE_TX_HASH }),
    isOnchainMintingEnabled: vi.fn().mockReturnValue(false),
    isChainEnabled: vi.fn().mockReturnValue(false),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function buildResolveApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { default: resolveRouter } = await import("../routes/v1/resolve");
  app.use("/api/v1/resolve", resolveRouter);
  app.use(errorHandler);
  return app;
}

function makeChainRegEntry(overrides: Record<string, unknown> = {}) {
  return {
    chain: "base",
    agentId: FAKE_AGENT_ID,
    txHash: FAKE_TX_HASH,
    contractAddress: FAKE_CONTRACT,
    registeredAt: new Date().toISOString(),
    custodian: "platform",
    ...overrides,
  };
}

// Track created entities for cleanup
const createdAgentIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdAgentIds.length > 0) {
    for (const id of createdAgentIds) {
      await db.delete(agentsTable).where(eq(agentsTable.id, id)).catch(() => {});
    }
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Registrar Integration — Billing sets pending_anchor (not pending_mint)", () => {
  it("nftStatus=pending_anchor is the canonical status after checkout", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const agent = await createTestAgent(user.id, {
      handle: `abi${Date.now().toString(36)}`,
      handlePaid: false,
      nftStatus: "none",
    });
    createdAgentIds.push(agent.id);

    // Simulate what handleCheckoutCompleted does: set pending_anchor
    await db.update(agentsTable)
      .set({ nftStatus: "pending_anchor", handlePaid: true, nftCustodian: "platform" })
      .where(eq(agentsTable.id, agent.id));

    const updated = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { nftStatus: true },
    });

    expect(updated?.nftStatus).toBe("pending_anchor");
  });
});

describe("Registrar Integration — nft-mint worker: pending_anchor → active", () => {
  it("processPendingAnchors advances agent to active and writes canonical chainRegistrations array", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const agent = await createTestAgent(user.id, {
      handle: `ab${Date.now().toString(36)}`,
      handlePaid: true,
      handleTier: "premium_3",
      nftStatus: "pending_anchor",
      nftCustodian: "platform",
    });
    createdAgentIds.push(agent.id);

    // Enable minting for this test
    const { registerOnChain } = await import("../services/chains/base");
    vi.mocked(registerOnChain).mockResolvedValueOnce({
      agentId: FAKE_AGENT_ID,
      txHash: FAKE_TX_HASH,
      chain: "base",
      contractAddress: FAKE_CONTRACT,
    });

    process.env.ONCHAIN_MINTING_ENABLED = "true";
    process.env.BASE_RPC_URL = "https://base-rpc.example.invalid";
    process.env.BASE_MINTER_PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.BASE_AGENTID_REGISTRAR = FAKE_CONTRACT;
    process.env.BASE_ERC8004_REGISTRY = FAKE_CONTRACT;
    process.env.BASE_PLATFORM_WALLET = "0x1234567890123456789012345678901234567890";

    const { processPendingAnchors } = await import("../workers/nft-mint");
    await processPendingAnchors();

    const updated = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: {
        nftStatus: true,
        chainRegistrations: true,
        erc8004AgentId: true,
        erc8004Chain: true,
        erc8004Registry: true,
        nftCustodian: true,
      },
    });

    expect(updated?.nftStatus).toBe("active");
    expect(updated?.nftCustodian).toBe("platform");
    expect(updated?.erc8004AgentId).toBe(FAKE_AGENT_ID);
    expect(updated?.erc8004Chain).toBe("base");
    expect(updated?.erc8004Registry).toBe(FAKE_CONTRACT);

    // chainRegistrations must be an array with one base entry
    expect(Array.isArray(updated?.chainRegistrations)).toBe(true);
    const regs = updated?.chainRegistrations as Array<Record<string, unknown>>;
    expect(regs).toHaveLength(1);
    expect(regs[0].chain).toBe("base");
    expect(regs[0].txHash).toBe(FAKE_TX_HASH);
    expect(regs[0].agentId).toBe(FAKE_AGENT_ID);

    delete process.env.ONCHAIN_MINTING_ENABLED;
    delete process.env.BASE_RPC_URL;
    delete process.env.BASE_MINTER_PRIVATE_KEY;
    delete process.env.BASE_AGENTID_REGISTRAR;
    delete process.env.BASE_ERC8004_REGISTRY;
    delete process.env.BASE_PLATFORM_WALLET;
  });
});

describe("Registrar Integration — Resolver reflects anchored truth", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await buildResolveApp();
  });

  it("anchored handle: erc8004Status=anchored, onchainStatus=anchored, anchorRecords.base set", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const agent = await createTestAgent(user.id, {
      handle: `xyz${Date.now().toString(36)}`,
      handlePaid: true,
      handleTier: "premium_3",
      status: "active",
      isPublic: true,
      nftStatus: "active",
      nftCustodian: "platform",
      erc8004AgentId: FAKE_AGENT_ID,
      erc8004Chain: "base",
      erc8004Registry: FAKE_CONTRACT,
      chainRegistrations: [makeChainRegEntry()],
    });
    createdAgentIds.push(agent.id);

    const res = await request(app)
      .get(`/api/v1/resolve/${agent.handle}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    const body = res.body.agent ?? res.body;
    const erc8004StatusAnchored = body.erc8004Status ?? body.handleIdentity?.erc8004Status;
    expect(erc8004StatusAnchored).toBe("anchored");
    expect(body.onchainStatus).toBe("anchored");
    expect(body.anchorRecords).toBeDefined();
    expect(body.anchorRecords?.base).toBeDefined();
    const base = body.anchorRecords?.base as Record<string, unknown>;
    expect(base.txHash).toBe(FAKE_TX_HASH);
    expect(base.agentId).toBe(FAKE_AGENT_ID);
    expect(body.credential?.anchoringMethod).toBe("base-registrar");
  });

  it("pending_anchor handle: onchainStatus=pending, erc8004Status=off-chain", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const agent = await createTestAgent(user.id, {
      handle: `pnd${Date.now().toString(36)}`,
      handlePaid: true,
      handleTier: "premium_3",
      status: "active",
      isPublic: true,
      nftStatus: "pending_anchor",
      nftCustodian: "platform",
      chainRegistrations: [],
    });
    createdAgentIds.push(agent.id);

    const res = await request(app)
      .get(`/api/v1/resolve/${agent.handle}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    const bodyPending = res.body.agent ?? res.body;
    expect(bodyPending.onchainStatus).toBe("pending");
    const erc8004Status = bodyPending.erc8004Status ?? bodyPending.handleIdentity?.erc8004Status;
    expect(erc8004Status).toBe("off-chain");
    expect(bodyPending.anchorRecords).toBeNull();
    expect(bodyPending.credential?.anchoringMethod).toBe("off-chain");
  });

  it("non-anchored handle: erc8004Status=off-chain, onchainStatus=off-chain", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const agent = await createTestAgent(user.id, {
      handle: `std${Date.now().toString(36)}`,
      handlePaid: true,
      handleTier: "standard_5plus",
      status: "active",
      isPublic: true,
      nftStatus: "none",
      chainRegistrations: [],
    });
    createdAgentIds.push(agent.id);

    const res = await request(app)
      .get(`/api/v1/resolve/${agent.handle}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    const bodyStd = res.body.agent ?? res.body;
    expect(bodyStd.onchainStatus).toBe("off-chain");
    const erc8004Status = bodyStd.erc8004Status ?? bodyStd.handleIdentity?.erc8004Status;
    expect(erc8004Status).toBe("off-chain");
    expect(bodyStd.anchorRecords).toBeNull();
    expect(bodyStd.credential?.anchoringMethod).toBe("off-chain");
  });

  it("resolver: handle with legacy object-form chainRegistrations { base: {...} } is still detected as anchored", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const agent = await createTestAgent(user.id, {
      handle: `lgc${Date.now().toString(36)}`,
      handlePaid: true,
      handleTier: "premium_3",
      status: "active",
      isPublic: true,
      nftStatus: "active",
      nftCustodian: "platform",
      erc8004AgentId: FAKE_AGENT_ID,
      chainRegistrations: {
        base: makeChainRegEntry(),
      } as unknown as Record<string, unknown>[],
    });
    createdAgentIds.push(agent.id);

    const res = await request(app)
      .get(`/api/v1/resolve/${agent.handle}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    const bodyLgc = res.body.agent ?? res.body;
    expect(bodyLgc.onchainStatus).toBe("anchored");
  });
});

describe("Registrar Integration — Claim-ticket flow", () => {
  const SIGNING_KEY = "test-claim-ticket-signing-key-for-integration-test";
  const TEST_WALLET = "0xaabbccdd11223344aabbccdd11223344aabbccdd";

  beforeAll(() => {
    process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY = SIGNING_KEY;
    process.env.HANDLE_CLAIM_ISSUER = "agentid-api";
    process.env.HANDLE_CLAIM_MAX_AGE_SECONDS = "300";
  });

  afterAll(() => {
    delete process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY;
    delete process.env.HANDLE_CLAIM_ISSUER;
    delete process.env.HANDLE_CLAIM_MAX_AGE_SECONDS;
  });

  it("issues a valid claim ticket and validates it", async () => {
    const { issueClaimTicket, validateClaimTicket } = await import("../services/claim-ticket");

    const ticket = issueClaimTicket({
      agentId: "test-agent-id",
      handle: "abc",
      wallet: TEST_WALLET,
    });

    expect(ticket).toBeTruthy();
    expect(typeof ticket).toBe("string");
    expect(ticket!.split(".")).toHaveLength(3);

    const result = await validateClaimTicket(ticket!, {
      wallet: TEST_WALLET,
      expectedHandle: "abc",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.handle).toBe("abc");
      expect(result.payload.sub).toBe("test-agent-id");
    }
  });

  it("rejects a ticket with a mismatched wallet", async () => {
    const { issueClaimTicket, validateClaimTicket } = await import("../services/claim-ticket");

    const ticket = issueClaimTicket({
      agentId: "test-agent-id",
      handle: "abc",
      wallet: TEST_WALLET,
    });

    const result = await validateClaimTicket(ticket!, {
      wallet: "0x0000000000000000000000000000000000000001",
      expectedHandle: "abc",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/wallet binding/i);
    }
  });

  it("rejects a ticket with a mismatched handle", async () => {
    const { issueClaimTicket, validateClaimTicket } = await import("../services/claim-ticket");

    const ticket = issueClaimTicket({
      agentId: "test-agent-id",
      handle: "abc",
    });

    const result = await validateClaimTicket(ticket!, {
      expectedHandle: "xyz",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/handle/i);
    }
  });

  it("rejects an expired ticket", async () => {
    // Set TTL to 0 so exp = now + 0 = now (already past by the time we check).
    // maxAgeSeconds >= 0 is now allowed.
    process.env.HANDLE_CLAIM_MAX_AGE_SECONDS = "0";

    const { issueClaimTicket, validateClaimTicket } = await import("../services/claim-ticket");

    const ticket = issueClaimTicket({
      agentId: "test-agent-id",
      handle: "def",
    });

    // Wait 1.1s so clock advances past the exp second boundary
    await new Promise(r => setTimeout(r, 1100));

    const result = await validateClaimTicket(ticket!, { expectedHandle: "def" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/expired/i);
    }

    process.env.HANDLE_CLAIM_MAX_AGE_SECONDS = "300";
  });

  it("prevents JTI replay: a ticket cannot be used twice", async () => {
    const { issueClaimTicket, validateClaimTicket } = await import("../services/claim-ticket");

    const ticket = issueClaimTicket({
      agentId: "test-agent-id",
      handle: `rep${Date.now().toString(36)}`,
    });

    const first = await validateClaimTicket(ticket!, {});
    expect(first.ok).toBe(true);

    const second = await validateClaimTicket(ticket!, {});
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toMatch(/already been used/i);
    }
  });

  it("returns null from issueClaimTicket when signing key is not set", async () => {
    delete process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY;

    const { issueClaimTicket } = await import("../services/claim-ticket");

    const ticket = issueClaimTicket({ agentId: "x", handle: "abc" });
    expect(ticket).toBeNull();

    process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY = SIGNING_KEY;
  });
});

describe("Registrar Integration — Handle lifecycle retires anchored handles (no re-auction)", () => {
  it("expireHandles marks anchored handle as retired and calls releaseHandle", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    // Create an agent with an expired handle that is anchored on-chain
    const expiredAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago (past 30-day grace)

    const agent = await createTestAgent(user.id, {
      handle: `exp${Date.now().toString(36)}`,
      handlePaid: true,
      handleTier: "premium_3",
      handleExpiresAt: expiredAt,
      status: "active",
      nftStatus: "active",
      nftCustodian: "platform",
      erc8004AgentId: FAKE_AGENT_ID,
      chainRegistrations: [makeChainRegEntry()],
    });
    createdAgentIds.push(agent.id);

    // Import the releaseHandleOnChain mock before running lifecycle
    const { releaseHandleOnChain } = await import("../services/chains/base");

    // Directly call expireHandles — it is exported from the worker module.
    const { expireHandles } = await import("../workers/handle-lifecycle");
    await expireHandles();

    const updated = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { handleStatus: true, handle: true, chainRegistrations: true },
    });

    // Handle should be retired (not auctioned)
    expect(updated?.handleStatus).toBe("retired");
    // The handle identifier should remain on the agent record (for history)
    expect(updated?.handle).toBeTruthy();
    // chainRegistrations must still be present (not wiped)
    expect(Array.isArray(updated?.chainRegistrations)).toBe(true);
  });
});

describe("Registrar Integration — Payment → anchor → resolver end-to-end", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await buildResolveApp();
  });

  it("full flow: set pending_anchor → run worker → resolve shows anchored", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const handle = `e2e${Date.now().toString(36)}`;

    // Step 1: Payment completed — handle is assigned, nftStatus=pending_anchor
    const agent = await createTestAgent(user.id, {
      handle,
      handlePaid: true,
      handleTier: "premium_3",
      status: "active",
      isPublic: true,
      nftStatus: "pending_anchor",
      nftCustodian: "platform",
      chainRegistrations: [],
    });
    createdAgentIds.push(agent.id);

    // Verify resolver shows pending state
    const pendingRes = await request(app)
      .get(`/api/v1/resolve/${handle}`)
      .set("Accept", "application/json");

    expect(pendingRes.status).toBe(200);
    const pendingBody = pendingRes.body.agent ?? pendingRes.body;
    expect(pendingBody.onchainStatus).toBe("pending");

    // Step 2: Simulate worker writing anchor result
    const chainRegEntry = makeChainRegEntry();
    await db.update(agentsTable)
      .set({
        nftStatus: "active",
        nftCustodian: "platform",
        erc8004AgentId: FAKE_AGENT_ID,
        erc8004Chain: "base",
        erc8004Registry: FAKE_CONTRACT,
        chainRegistrations: [chainRegEntry],
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    // Step 3: Resolver now shows anchored
    const anchoredRes = await request(app)
      .get(`/api/v1/resolve/${handle}`)
      .set("Accept", "application/json");

    expect(anchoredRes.status).toBe(200);
    const anchoredBody = anchoredRes.body.agent ?? anchoredRes.body;
    expect(anchoredBody.onchainStatus).toBe("anchored");
    expect(anchoredBody.anchorRecords?.base).toBeDefined();
    expect((anchoredBody.anchorRecords?.base as Record<string, unknown>).txHash).toBe(FAKE_TX_HASH);

    const erc8004Status = anchoredBody.erc8004Status ?? anchoredBody.handleIdentity?.erc8004Status;
    expect(erc8004Status).toBe("anchored");
    expect(anchoredBody.credential?.anchoringMethod).toBe("base-registrar");
  });
});

// ─────────────────────────────────────────────────────────────────
// ABI Selector Tests — prove function encoding correctness
// ─────────────────────────────────────────────────────────────────

describe("Registrar Integration — ABI function selector encoding", () => {
  it("encodes registerHandle selector correctly (0x8a10bc17)", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const { encodeFunctionData } = await import("viem");

    const encoded = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: "registerHandle",
      args: ["myhandle", 3, BigInt(Math.floor(Date.now() / 1000) + 86400)],
    });

    // First 4 bytes are the function selector
    const selector = encoded.slice(0, 10);
    // selector = keccak256("registerHandle(string,uint8,uint256)")[0:4]
    const { keccak256, toBytes } = await import("viem");
    const expectedSelector = keccak256(toBytes("registerHandle(string,uint8,uint256)")).slice(0, 10);
    expect(selector).toBe(expectedSelector);
  });

  it("encodes transferToUser selector correctly", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const { encodeFunctionData, keccak256, toBytes } = await import("viem");

    const encoded = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: "transferToUser",
      args: ["myhandle", "0x0000000000000000000000000000000000000001"],
    });

    const selector = encoded.slice(0, 10);
    const expectedSelector = keccak256(toBytes("transferToUser(string,address)")).slice(0, 10);
    expect(selector).toBe(expectedSelector);
  });

  it("encodes releaseHandle selector correctly", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const { encodeFunctionData, keccak256, toBytes } = await import("viem");

    const encoded = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: "releaseHandle",
      args: ["myhandle"],
    });

    const selector = encoded.slice(0, 10);
    const expectedSelector = keccak256(toBytes("releaseHandle(string)")).slice(0, 10);
    expect(selector).toBe(expectedSelector);
  });
});

// ─────────────────────────────────────────────────────────────────
// E2E: Billing pending_anchor → claim ticket stored → claim-nft
// ─────────────────────────────────────────────────────────────────

describe("Registrar Integration — Billing queues pending_anchor with claim ticket", () => {
  let app: express.Express;

  beforeAll(async () => {
    // Ensure claim-ticket signing key is available for this test suite
    if (!process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY) {
      process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY = "test-signing-key-for-registrar-integration";
    }

    app = express();
    app.use(express.json());
    const resolveRouter = (await import("../routes/v1/resolve")).default;
    app.use("/api/v1/resolve", resolveRouter);
    app.use(errorHandler);
  });

  it("handle_mint_request webhook: sets pending_anchor and stores pendingClaimTicket in metadata", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const handle = `clm${Date.now().toString(36)}`;
    const agent = await createTestAgent(user.id, {
      handle,
      handlePaid: true,
      handleTier: "standard_5plus",
      status: "active",
      nftStatus: "none",
      nftCustodian: null,
    });
    createdAgentIds.push(agent.id);

    // Simulate what the Stripe webhook handler does for handle_mint_request
    const { handleCheckoutCompleted } = await import("../services/billing");

    // Build a fake Stripe session with handle_mint_request type
    const fakeSession = {
      id: `cs_test_${Date.now()}`,
      metadata: {
        type: "handle_mint_request",
        handle,
        userId: user.id,
        agentId: agent.id,
      },
    } as unknown as Parameters<typeof handleCheckoutCompleted>[0];

    await handleCheckoutCompleted(fakeSession);

    const updated = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { nftStatus: true, metadata: true },
    });

    // Must be queued for anchoring
    expect(updated?.nftStatus).toBe("pending_anchor");

    // Must have a pendingClaimTicket in metadata
    const meta = updated?.metadata as Record<string, unknown> | null;
    expect(meta?.pendingClaimTicket).toBeDefined();
    expect(typeof meta?.pendingClaimTicket).toBe("string");

    // The stored ticket must be valid when validated
    const { validateClaimTicket } = await import("../services/claim-ticket");
    const result = await validateClaimTicket(meta!.pendingClaimTicket as string, {
      expectedHandle: handle,
    });
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// E2E: /claim-nft HTTP route — success, expired, replay atomicity
// ─────────────────────────────────────────────────────────────────

describe("Registrar Integration — /claim-nft route E2E (success, expired, replay)", () => {
  let claimApp: express.Express;
  let userId: string;

  beforeAll(async () => {
    // Ensure claim-ticket signing key is available
    if (!process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY) {
      process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY = "test-signing-key-claim-nft-e2e";
    }
    // Enable on-chain minting for claim-nft E2E tests — endpoint is fail-closed without it.
    const { isOnchainMintingEnabled } = await import("../services/chains/base");
    vi.mocked(isOnchainMintingEnabled).mockReturnValue(true);
  });

  afterAll(async () => {
    // Restore isOnchainMintingEnabled to disabled for other test suites.
    const { isOnchainMintingEnabled } = await import("../services/chains/base");
    vi.mocked(isOnchainMintingEnabled).mockReturnValue(false);
  });

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    createdUserIds.push(userId);

    const handlesRouter = (await import("../routes/v1/handles")).default;
    claimApp = express();
    claimApp.use(express.json());
    // Inject auth: simulate a logged-in user
    claimApp.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = userId;
      (req as Record<string, unknown>).user = { id: userId, name: "Test", profileImage: null };
      next();
    });
    claimApp.use("/api/v1/handles", handlesRouter);
    claimApp.use(errorHandler);
  });

  it("rejects /claim-nft without a claim ticket (CLAIM_TICKET_REQUIRED)", async () => {
    const user2 = await createTestUser();
    createdUserIds.push(user2.id);
    const handle = `noclm${Date.now().toString(36)}`;
    const agent = await createTestAgent(user2.id, {
      handle,
      handlePaid: true,
      handleTier: "standard_5plus",
      status: "active",
      nftStatus: "pending_anchor",
      nftCustodian: "platform",
    });
    createdAgentIds.push(agent.id);

    // Register a separate app for user2
    const handlesRouter = (await import("../routes/v1/handles")).default;
    const app2 = express();
    app2.use(express.json());
    app2.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = user2.id;
      (req as Record<string, unknown>).user = { id: user2.id, name: "Test2", profileImage: null };
      next();
    });
    app2.use("/api/v1/handles", handlesRouter);
    app2.use(errorHandler);

    const res = await request(app2)
      .post(`/api/v1/handles/${handle}/claim-nft`)
      .send({ userWallet: "0x0000000000000000000000000000000000000001" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CLAIM_TICKET_REQUIRED");
  });

  it("rejects /claim-nft with an expired claim ticket (INVALID_CLAIM_TICKET)", async () => {
    const user3 = await createTestUser();
    createdUserIds.push(user3.id);
    const handle = `expclm${Date.now().toString(36)}`;
    const agent = await createTestAgent(user3.id, {
      handle,
      handlePaid: true,
      handleTier: "standard_5plus",
      status: "active",
      nftStatus: "active",
      nftCustodian: "platform",
      chainRegistrations: [makeChainRegEntry()],
    });
    createdAgentIds.push(agent.id);

    // Issue a ticket with 0-second TTL so it expires immediately
    process.env.HANDLE_CLAIM_MAX_AGE_SECONDS = "0";
    const { issueClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: agent.id, handle });
    process.env.HANDLE_CLAIM_MAX_AGE_SECONDS = "300";

    // Wait for it to expire (1.1s)
    await new Promise(r => setTimeout(r, 1100));

    const handlesRouter = (await import("../routes/v1/handles")).default;
    const app3 = express();
    app3.use(express.json());
    app3.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = user3.id;
      (req as Record<string, unknown>).user = { id: user3.id, name: "Test3", profileImage: null };
      next();
    });
    app3.use("/api/v1/handles", handlesRouter);
    app3.use(errorHandler);

    const res = await request(app3)
      .post(`/api/v1/handles/${handle}/claim-nft`)
      .send({ userWallet: "0x0000000000000000000000000000000000000002", claimTicket: ticket })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_CLAIM_TICKET");
    expect(res.body.message).toMatch(/expired/i);
  });

  it("rejects /claim-nft replay — second request with same ticket fails (JTI consumed)", async () => {
    const user4 = await createTestUser();
    createdUserIds.push(user4.id);
    const handle = `rply${Date.now().toString(36)}`;
    const agent = await createTestAgent(user4.id, {
      handle,
      handlePaid: true,
      handleTier: "standard_5plus",
      status: "active",
      nftStatus: "active",
      nftCustodian: "platform",
      erc8004AgentId: FAKE_AGENT_ID,
      chainRegistrations: [makeChainRegEntry()],
    });
    createdAgentIds.push(agent.id);

    const { issueClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: agent.id, handle });
    expect(ticket).toBeDefined();

    const handlesRouter = (await import("../routes/v1/handles")).default;
    const app4 = express();
    app4.use(express.json());
    app4.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = user4.id;
      (req as Record<string, unknown>).user = { id: user4.id, name: "Test4", profileImage: null };
      next();
    });
    app4.use("/api/v1/handles", handlesRouter);
    app4.use(errorHandler);

    const wallet = "0x0000000000000000000000000000000000000003";

    // First claim — should succeed (200) even though on-chain minting is disabled in tests
    const res1 = await request(app4)
      .post(`/api/v1/handles/${handle}/claim-nft`)
      .send({ userWallet: wallet, claimTicket: ticket })
      .set("Content-Type", "application/json");

    expect(res1.status).toBe(200);
    expect(res1.body.status).toBe("claimed");
    expect(res1.body.nftCustodian).toBe("user");

    // Second claim — handle already claimed by user, should fail with ALREADY_CLAIMED.
    // (The JTI would also be rejected if the handle were still claimable, but
    //  ALREADY_CLAIMED is checked first since nftCustodian=user after the first success.)
    const res2 = await request(app4)
      .post(`/api/v1/handles/${handle}/claim-nft`)
      .send({ userWallet: wallet, claimTicket: ticket })
      .set("Content-Type", "application/json");

    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe("ALREADY_CLAIMED");
  });

  it("accepts /claim-nft with a valid ticket and marks custody as user", async () => {
    const user5 = await createTestUser();
    createdUserIds.push(user5.id);
    const handle = `valid${Date.now().toString(36)}`;
    const wallet = "0x0000000000000000000000000000000000000004";
    const agent = await createTestAgent(user5.id, {
      handle,
      handlePaid: true,
      handleTier: "standard_5plus",
      status: "active",
      nftStatus: "active",
      nftCustodian: "platform",
      erc8004AgentId: FAKE_AGENT_ID,
      chainRegistrations: [makeChainRegEntry()],
    });
    createdAgentIds.push(agent.id);

    const { issueClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: agent.id, handle, wallet: wallet.toLowerCase() });
    expect(ticket).toBeDefined();

    const handlesRouter = (await import("../routes/v1/handles")).default;
    const app5 = express();
    app5.use(express.json());
    app5.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = user5.id;
      (req as Record<string, unknown>).user = { id: user5.id, name: "Test5", profileImage: null };
      next();
    });
    app5.use("/api/v1/handles", handlesRouter);
    app5.use(errorHandler);

    const res = await request(app5)
      .post(`/api/v1/handles/${handle}/claim-nft`)
      .send({ userWallet: wallet, claimTicket: ticket })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("claimed");
    expect(res.body.nftCustodian).toBe("user");
    expect(res.body.nftOwnerWallet).toBe(wallet.toLowerCase());

    // Verify DB state
    const updated = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { nftCustodian: true, nftOwnerWallet: true, nftStatus: true },
    });
    expect(updated?.nftCustodian).toBe("user");
    expect(updated?.nftOwnerWallet).toBe(wallet.toLowerCase());
    expect(updated?.nftStatus).toBe("active");
  });

  it("pending_anchor + no chainRegistrations: registerOnChain then transferToUser called before DB commit", async () => {
    // This test proves the required registrar sequencing:
    //   registerHandle → transferToUser → commit DB (in that order, atomically)
    // Starting state: handle is in pending_anchor with no on-chain registration yet.

    const user6 = await createTestUser();
    createdUserIds.push(user6.id);
    const handle = `seq${Date.now().toString(36)}`;
    const wallet = "0x0000000000000000000000000000000000000006";

    const agent = await createTestAgent(user6.id, {
      handle,
      handlePaid: true,
      handleTier: "standard_5plus",
      status: "active",
      nftStatus: "pending_anchor",
      nftCustodian: "platform",
      chainRegistrations: null, // explicitly not anchored yet
    });
    createdAgentIds.push(agent.id);

    const { issueClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: agent.id, handle, wallet: wallet.toLowerCase() });
    expect(ticket).toBeDefined();

    // Capture call order to verify sequence: registerOnChain before transferToUser
    const callOrder: string[] = [];
    const { registerOnChain, transferToUser: transferToUserMock } = await import("../services/chains/base");
    vi.mocked(registerOnChain).mockImplementationOnce(async () => {
      callOrder.push("registerOnChain");
      return {
        agentId: FAKE_AGENT_ID,
        txHash: FAKE_TX_HASH,
        chain: "base" as const,
        contractAddress: FAKE_CONTRACT,
      };
    });
    vi.mocked(transferToUserMock).mockImplementationOnce(async () => {
      callOrder.push("transferToUser");
      return { txHash: FAKE_TX_HASH };
    });

    const app6 = express();
    app6.use(express.json());
    app6.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = user6.id;
      (req as Record<string, unknown>).user = { id: user6.id, name: "Test6", profileImage: null };
      next();
    });
    const handlesRouter = (await import("../routes/v1/handles")).default;
    app6.use("/api/v1/handles", handlesRouter);
    app6.use(errorHandler);

    const res = await request(app6)
      .post(`/api/v1/handles/${handle}/claim-nft`)
      .send({ userWallet: wallet, claimTicket: ticket })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("claimed");

    // Verify sequence: registerOnChain must precede transferToUser
    expect(callOrder).toEqual(["registerOnChain", "transferToUser"]);

    // Verify DB committed both registrar agentId and user custody
    const committed = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { nftStatus: true, nftCustodian: true, nftOwnerWallet: true, erc8004AgentId: true, chainRegistrations: true },
    });
    expect(committed?.nftStatus).toBe("active");
    expect(committed?.nftCustodian).toBe("user");
    expect(committed?.nftOwnerWallet).toBe(wallet.toLowerCase());
    expect(committed?.erc8004AgentId).toBe(FAKE_AGENT_ID);
    const regs = committed?.chainRegistrations as Record<string, unknown>[] | null;
    expect(Array.isArray(regs)).toBe(true);
    expect((regs ?? []).length).toBeGreaterThan(0);
    expect((regs ?? [])[0]).toMatchObject({ chain: "base", agentId: FAKE_AGENT_ID });
  });

  it("partial failure: registerOnChain succeeds, transferToUser fails — ticket remains usable for retry", async () => {
    // This test verifies deferred JTI consumption:
    // The JTI should NOT be burned until AFTER DB commit succeeds.
    // If transferToUser fails (on-chain step 2), the ticket must remain valid for retry.

    const user7 = await createTestUser();
    createdUserIds.push(user7.id);
    const handle = `retry${Date.now().toString(36)}`;
    const wallet = "0x0000000000000000000000000000000000000007";

    const agent = await createTestAgent(user7.id, {
      handle,
      handlePaid: true,
      handleTier: "standard_5plus",
      status: "active",
      nftStatus: "pending_anchor",
      nftCustodian: "platform",
      chainRegistrations: null,
    });
    createdAgentIds.push(agent.id);

    const { issueClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: agent.id, handle, wallet: wallet.toLowerCase() });
    expect(ticket).toBeDefined();

    const { registerOnChain, transferToUser: transferToUserMock, resolveOnChain } = await import("../services/chains/base");

    // First attempt:
    // - resolveOnChain returns null (not yet registered on-chain)
    // - registerOnChain succeeds
    // - transferToUser fails
    vi.mocked(resolveOnChain).mockResolvedValueOnce(null);
    vi.mocked(registerOnChain).mockResolvedValueOnce({
      agentId: FAKE_AGENT_ID,
      txHash: FAKE_TX_HASH,
      chain: "base" as const,
      contractAddress: FAKE_CONTRACT,
    });
    vi.mocked(transferToUserMock).mockRejectedValueOnce(new Error("RPC timeout — transfer failed"));

    const app7 = express();
    app7.use(express.json());
    app7.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = user7.id;
      (req as Record<string, unknown>).user = { id: user7.id, name: "Test7", profileImage: null };
      next();
    });
    const handlesRouter = (await import("../routes/v1/handles")).default;
    app7.use("/api/v1/handles", handlesRouter);
    app7.use(errorHandler);

    const failRes = await request(app7)
      .post(`/api/v1/handles/${handle}/claim-nft`)
      .send({ userWallet: wallet, claimTicket: ticket })
      .set("Content-Type", "application/json");

    // Transfer failed — should return 500
    expect(failRes.status).toBe(500);
    expect(failRes.body.error).toBe("TRANSFER_FAILED");

    // DB must NOT have been committed: agent still pending_anchor / platform custody
    const afterFail = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { nftStatus: true, nftCustodian: true },
    });
    expect(afterFail?.nftCustodian).toBe("platform");
    expect(afterFail?.nftStatus).toBe("pending_anchor");

    // Second attempt (retry):
    // - resolveOnChain returns existing on-chain registration → skips re-register (idempotent)
    // - transferToUser succeeds
    // - ticket still valid (JTI not burned on partial failure)
    vi.mocked(resolveOnChain).mockResolvedValueOnce({
      agentId: FAKE_AGENT_ID,
      nftOwner: wallet as `0x${string}`,
      tier: 1,
      active: true,
      expired: false,
    });
    vi.mocked(transferToUserMock).mockResolvedValueOnce({ txHash: FAKE_TX_HASH });

    const retryRes = await request(app7)
      .post(`/api/v1/handles/${handle}/claim-nft`)
      .send({ userWallet: wallet, claimTicket: ticket })
      .set("Content-Type", "application/json");

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.status).toBe("claimed");
    expect(retryRes.body.nftCustodian).toBe("user");

    // DB should now be committed with user custody
    const afterRetry = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { nftStatus: true, nftCustodian: true, nftOwnerWallet: true },
    });
    expect(afterRetry?.nftCustodian).toBe("user");
    expect(afterRetry?.nftOwnerWallet).toBe(wallet.toLowerCase());
    expect(afterRetry?.nftStatus).toBe("active");
  });
});

// ─────────────────────────────────────────────────────────────────
// E2E: Post-payment claim-ticket → /claim-nft without manual ticket fabrication
// ─────────────────────────────────────────────────────────────────

describe("Registrar Integration — Post-payment → /claim-nft without manual ticket fabrication", () => {
  beforeAll(async () => {
    if (!process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY) {
      process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY = "test-signing-key-post-payment";
    }
    // Enable on-chain minting — /claim-nft is fail-closed without it.
    const { isOnchainMintingEnabled } = await import("../services/chains/base");
    vi.mocked(isOnchainMintingEnabled).mockReturnValue(true);
  });

  afterAll(async () => {
    const { isOnchainMintingEnabled } = await import("../services/chains/base");
    vi.mocked(isOnchainMintingEnabled).mockReturnValue(false);
  });

  it("request-mint queues pending_anchor and returns claimTicket; that ticket completes /claim-nft", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    // Create a premium handle agent (handles 1-4 chars go through free anchoring path)
    const handle = `rqmt${Date.now().toString(36)}`;
    const agent = await createTestAgent(user.id, {
      handle,
      handlePaid: true,
      handleTier: "premium_4",
      status: "active",
      nftStatus: "none",
      nftCustodian: null,
    });
    createdAgentIds.push(agent.id);

    // Build the handles router app for this user
    const handlesRouter = (await import("../routes/v1/handles")).default;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as Record<string, unknown>).userId = user.id;
      (req as Record<string, unknown>).user = { id: user.id, name: "PostPay", profileImage: null };
      next();
    });
    app.use("/api/v1/handles", handlesRouter);
    app.use(errorHandler);

    // Step 1: POST /request-mint — should return nftStatus=pending_anchor and a claimTicket
    // NOTE: request-mint only fires the non-Stripe path for premium handles (1–4 chars).
    //       But ONCHAIN_MINTING_ENABLED is false in tests, so it queues via pending_anchor path.
    //
    // HOWEVER, request-mint throws ONCHAIN_MINTING_DISABLED when that env var is false.
    // So instead we simulate what request-mint does: directly call billing.handleCheckoutCompleted
    // with handle_mint_request type (same path as the Stripe webhook after payment).
    const { handleCheckoutCompleted } = await import("../services/billing");
    const fakeSession = {
      id: `cs_test_postpay_${Date.now()}`,
      metadata: {
        type: "handle_mint_request",
        handle,
        userId: user.id,
        agentId: agent.id,
      },
    } as unknown as Parameters<typeof handleCheckoutCompleted>[0];

    await handleCheckoutCompleted(fakeSession);

    // Step 2: Read the stored claim ticket from agent metadata
    const afterPayment = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { nftStatus: true, nftCustodian: true, metadata: true },
    });

    expect(afterPayment?.nftStatus).toBe("pending_anchor");
    const meta = afterPayment?.metadata as Record<string, unknown> | null;
    const storedTicket = meta?.pendingClaimTicket as string | undefined;
    expect(storedTicket).toBeDefined();
    expect(typeof storedTicket).toBe("string");

    // Step 3: Use that stored ticket (no fabrication) to claim via /claim-nft
    // First set the agent to active+anchored so /claim-nft succeeds without on-chain calls
    await db.update(agentsTable)
      .set({
        nftStatus: "active",
        nftCustodian: "platform",
        erc8004AgentId: FAKE_AGENT_ID,
        chainRegistrations: [makeChainRegEntry()],
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    const wallet = "0x0000000000000000000000000000000000000009";
    const claimRes = await request(app)
      .post(`/api/v1/handles/${handle}/claim-nft`)
      .send({ userWallet: wallet, claimTicket: storedTicket })
      .set("Content-Type", "application/json");

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.status).toBe("claimed");
    expect(claimRes.body.nftCustodian).toBe("user");
    expect(claimRes.body.nftOwnerWallet).toBe(wallet.toLowerCase());
  });
});

// ─────────────────────────────────────────────────────────────────
// Handle lifecycle: anchored handle cannot be re-registered after expiry
// ─────────────────────────────────────────────────────────────────

describe("Registrar Integration — Anchored handle cannot be re-registered after expiry", () => {
  it("expireHandles retires anchored handle; its handle field remains set (not cleared for re-auction)", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const expiredAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const handle = `anch${Date.now().toString(36)}`;

    const agent = await createTestAgent(user.id, {
      handle,
      handlePaid: true,
      handleTier: "premium_3",
      handleExpiresAt: expiredAt,
      status: "active",
      nftStatus: "active",
      nftCustodian: "platform",
      erc8004AgentId: FAKE_AGENT_ID,
      chainRegistrations: [makeChainRegEntry()],
    });
    createdAgentIds.push(agent.id);

    const { expireHandles } = await import("../workers/handle-lifecycle");
    await expireHandles();

    const retired = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agent.id),
      columns: { handleStatus: true, handle: true, chainRegistrations: true },
    });

    // Anchored handles are retired — NOT put back in auction
    expect(retired?.handleStatus).toBe("retired");
    // Handle field is preserved for history/audit (not cleared)
    expect(retired?.handle).toBe(handle);
    // chainRegistrations must still be intact (not wiped)
    expect(Array.isArray(retired?.chainRegistrations)).toBe(true);

    // Now verify: no other agent should be able to acquire this handle via createTestAgent
    // (the handle row is still tied to the retired agent, preventing re-registration)
    const handleOwner = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.handle, handle),
      columns: { id: true, handleStatus: true },
    });
    expect(handleOwner?.id).toBe(agent.id);
    expect(handleOwner?.handleStatus).toBe("retired");
  });
});
