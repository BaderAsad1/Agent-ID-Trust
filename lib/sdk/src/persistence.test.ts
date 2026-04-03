import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentID } from "./client.js";
import { formatPromptBlock } from "./utils/prompt-block.js";
import type { BootstrapBundle, PersistedAgentState } from "./types.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const MOCK_AGENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const MOCK_HANDLE = "my-test-agent";
const MOCK_API_KEY = "agk_testkey1234567890abcdef";
const CANONICAL_DID = `did:web:getagent.id:agents:${MOCK_AGENT_ID}`;

function makeMockBootstrap(overrides: Partial<BootstrapBundle> = {}): BootstrapBundle {
  return {
    spec_version: "1.2.0",
    agent_id: MOCK_AGENT_ID,
    handle: MOCK_HANDLE,
    display_name: "My Test Agent",
    did: CANONICAL_DID,
    protocol_address: `${MOCK_HANDLE}.agentid`,
    erc8004_uri: `https://getagent.id/api/v1/p/${MOCK_AGENT_ID}/erc8004`,
    provisional_domain: `${MOCK_HANDLE}.getagent.id`,
    public_profile_url: `https://getagent.id/${MOCK_HANDLE}`,
    inbox_id: "inbox-123",
    inbox_address: `${MOCK_HANDLE}@getagent.id`,
    inbox_poll_endpoint: `/api/v1/mail/agents/${MOCK_AGENT_ID}/messages`,
    trust: { score: 42, tier: "verified", signals: [] },
    capabilities: ["web-search", "summarization"],
    auth_methods: ["agent-key"],
    key_ids: [],
    status: "active",
    prompt_block: "",
    uuid_resolution_url: `https://getagent.id/api/v1/resolve/id/${MOCK_AGENT_ID}`,
    claim_url: null,
    is_owned: true,
    ...overrides,
  };
}

function makeInitializedAgent(bootstrap: BootstrapBundle = makeMockBootstrap()): AgentID {
  const state: PersistedAgentState = {
    version: 1,
    baseUrl: "https://getagent.id",
    agentId: MOCK_AGENT_ID,
    apiKey: MOCK_API_KEY,
    did: CANONICAL_DID,
    handle: MOCK_HANDLE,
    resolverUrl: `https://getagent.id/api/v1/resolve/${MOCK_HANDLE}`,
    profileUrl: `https://getagent.id/${MOCK_HANDLE}`,
    savedAt: new Date().toISOString(),
    cachedBootstrap: bootstrap,
  };
  return AgentID.fromState(state);
}

describe("PersistedAgentState type", () => {
  it("[T01] PersistedAgentState has version=1, agentId, apiKey, did, handle, resolverUrl, profileUrl, savedAt", () => {
    const agent = makeInitializedAgent();
    const state = agent.exportState();
    expect(state.version).toBe(1);
    expect(state.agentId).toBe(MOCK_AGENT_ID);
    expect(state.apiKey).toBe(MOCK_API_KEY);
    expect(state.did).toBe(CANONICAL_DID);
    expect(state.handle).toBe(MOCK_HANDLE);
    expect(state.resolverUrl).toMatch(/resolve\//);
    expect(state.profileUrl).toBeTruthy();
    expect(state.savedAt).toBeTruthy();
    expect(new Date(state.savedAt).getTime()).not.toBeNaN();
  });

  it("[T02] exportState() separates permanent fields from mutable (cachedBootstrap is optional cache)", () => {
    const agent = makeInitializedAgent();
    const state = agent.exportState();
    expect(state.cachedBootstrap).toBeDefined();
    expect(state.cachedBootstrap?.trust.score).toBe(42);
    const { cachedBootstrap, ...permanentPart } = state;
    expect(permanentPart.agentId).toBe(MOCK_AGENT_ID);
    expect(permanentPart.did).toBe(CANONICAL_DID);
  });
});

describe("AgentID.fromState() restore", () => {
  it("[T03] fromState() restores agent without re-registration", () => {
    const agent = makeInitializedAgent();
    const state = agent.exportState();
    const restored = AgentID.fromState(state);
    expect(restored.agentId).toBe(MOCK_AGENT_ID);
    expect(restored.did).toBe(CANONICAL_DID);
  });

  it("[T04] fromState() with handle — resolverUrl uses handle-based path", () => {
    const agent = makeInitializedAgent();
    const state = agent.exportState();
    expect(state.resolverUrl).toContain(MOCK_HANDLE);
  });

  it("[T05] fromState() without handle — resolverUrl uses UUID-based path", () => {
    const bootstrap = makeMockBootstrap({ handle: null });
    const state: PersistedAgentState = {
      version: 1,
      baseUrl: "https://getagent.id",
      agentId: MOCK_AGENT_ID,
      apiKey: MOCK_API_KEY,
      did: CANONICAL_DID,
      handle: null,
      resolverUrl: `https://getagent.id/api/v1/resolve/id/${MOCK_AGENT_ID}`,
      profileUrl: `https://getagent.id/id/${MOCK_AGENT_ID}`,
      savedAt: new Date().toISOString(),
      cachedBootstrap: bootstrap,
    };
    const restored = AgentID.fromState(state);
    expect(restored.agentId).toBe(MOCK_AGENT_ID);
    expect(restored.did).toBe(CANONICAL_DID);
    expect(restored.resolverUrl).toContain(`/resolve/id/${MOCK_AGENT_ID}`);
  });

  it("[T06] fromState() rejects unsupported state version", () => {
    const state = { version: 99, agentId: "x", apiKey: "y", baseUrl: "z" } as unknown as PersistedAgentState;
    expect(() => AgentID.fromState(state)).toThrow("Unsupported state version");
  });
});

describe("writeStateFile / readStateFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentid-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("[T07] writeStateFile() creates valid JSON on disk", async () => {
    const agent = makeInitializedAgent();
    const filePath = path.join(tmpDir, "state.json");
    await agent.writeStateFile(filePath);
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.agentId).toBe(MOCK_AGENT_ID);
    expect(parsed.did).toBe(CANONICAL_DID);
  });

  it("[T08] readStateFile() restores agent from file", async () => {
    const agent = makeInitializedAgent();
    const filePath = path.join(tmpDir, "state.json");
    await agent.writeStateFile(filePath);
    const restored = await AgentID.readStateFile(filePath);
    expect(restored.agentId).toBe(MOCK_AGENT_ID);
    expect(restored.did).toBe(CANONICAL_DID);
  });

  it("[T09] writeStateFile creates parent directories if needed", async () => {
    const agent = makeInitializedAgent();
    const filePath = path.join(tmpDir, "nested", "deep", "state.json");
    await agent.writeStateFile(filePath);
    const raw = await fs.readFile(filePath, "utf-8");
    expect(JSON.parse(raw).agentId).toBe(MOCK_AGENT_ID);
  });
});

describe("refreshBootstrap() — permanent vs mutable fields", () => {
  it("[T10] refreshBootstrap() updates mutable fields (trust, capabilities) without changing agentId or did", async () => {
    const agent = makeInitializedAgent();
    const originalId = agent.agentId;
    const originalDid = agent.did;

    const updatedBootstrap = makeMockBootstrap({
      trust: { score: 85, tier: "elite", signals: [] },
      capabilities: ["new-cap"],
    });

    vi.spyOn(agent as unknown as { fetchBootstrap: () => Promise<void> }, "fetchBootstrap")
      .mockImplementation(async function (this: unknown) {
        (this as { bootstrap: BootstrapBundle }).bootstrap = updatedBootstrap;
      });

    await agent.refreshBootstrap();
    expect(agent.agentId).toBe(originalId);
    expect(agent.did).toBe(originalDid);
    expect(agent.trustScore).toBe(85);
    expect(agent.trustTier).toBe("elite");
    expect(agent.capabilities).toContain("new-cap");
  });
});

describe("heartbeat live field updates", () => {
  it("[T11] heartbeat response updates trust fields without touching agentId", async () => {
    const agent = makeInitializedAgent();
    const originalId = agent.agentId;

    const responseBody = JSON.stringify({
      acknowledged: true,
      server_time: new Date().toISOString(),
      next_expected_heartbeat: new Date().toISOString(),
      updateContext: true,
      identity: {
        trustScore: 75,
        trustTier: "trusted",
        status: "active",
        capabilities: ["updated-cap"],
        inbox: "my-test-agent@getagent.id",
      },
      mail: { unreadCount: 0, hasNewMessages: false, inboxEndpoint: "/inbox" },
      promptBlockUrl: "/prompt",
    });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => JSON.parse(responseBody),
      text: async () => responseBody,
    });

    vi.stubGlobal("fetch", mockFetch);

    try {
      await agent.heartbeat();
      expect(agent.agentId).toBe(originalId);
      expect(agent.trustScore).toBe(75);
      expect(agent.trustTier).toBe("trusted");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("DID canonicalization — prompt-block", () => {
  it("[T12] formatPromptBlock uses did:web:getagent.id:agents:<uuid> as primary DID", () => {
    const bundle = makeMockBootstrap();
    const block = formatPromptBlock(bundle);
    expect(block).toContain(`did:web:getagent.id:agents:${MOCK_AGENT_ID}`);
  });

  it("[T13] formatPromptBlock labels did:agentid:<handle> as alias only", () => {
    const bundle = makeMockBootstrap();
    const block = formatPromptBlock(bundle);
    const canonicalLine = block.split("\n").find((l) => l.includes("DID (canonical)"));
    expect(canonicalLine).toBeTruthy();
    expect(canonicalLine).toContain("did:web:getagent.id:agents:");
    const aliasLine = block.split("\n").find((l) => l.includes("alias"));
    expect(aliasLine).toContain("did:agentid:");
  });

  it("[T14] formatPromptBlock without handle omits alias line", () => {
    const bundle = makeMockBootstrap({ handle: null });
    const block = formatPromptBlock(bundle);
    expect(block).not.toContain("alias");
  });

  it("[T15] formatPromptBlock uses agentId from bundle fields", () => {
    const bundle = makeMockBootstrap();
    const block = formatPromptBlock(bundle);
    expect(block).toContain(MOCK_AGENT_ID);
  });
});

describe("DID canonicalization — identity-file formats", () => {
  it("[T16] canonical DID for no-handle agent is did:web:getagent.id:agents:<uuid>", () => {
    const agent = makeInitializedAgent(makeMockBootstrap({ handle: null }));
    expect(agent.did).toBe(CANONICAL_DID);
    expect(agent.did).toMatch(/^did:web:getagent\.id:agents:[0-9a-f-]{36}$/);
  });

  it("[T17] canonical DID is stable regardless of handle presence", () => {
    const withHandle = makeInitializedAgent(makeMockBootstrap({ handle: "some-handle" }));
    const withoutHandle = makeInitializedAgent(makeMockBootstrap({ handle: null }));
    expect(withHandle.did).toBe(CANONICAL_DID);
    expect(withoutHandle.did).toBe(CANONICAL_DID);
  });

  it("[T18] agentId getter returns stable UUID, not handle", () => {
    const agent = makeInitializedAgent();
    expect(agent.agentId).toBe(MOCK_AGENT_ID);
    expect(agent.agentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe("exportState canonical DID", () => {
  it("[T19] exportState().did is always did:web:getagent.id:agents:<uuid>", () => {
    const agent = makeInitializedAgent();
    const state = agent.exportState();
    expect(state.did).toBe(CANONICAL_DID);
    expect(state.did).toMatch(/^did:web:getagent\.id:agents:/);
    expect(state.did).not.toContain("did:agentid:");
  });

  it("[T20] fromState → exportState roundtrip preserves permanent identity fields", () => {
    const agent = makeInitializedAgent();
    const state1 = agent.exportState();
    const restored = AgentID.fromState(state1);
    const state2 = restored.exportState();
    expect(state2.agentId).toBe(state1.agentId);
    expect(state2.did).toBe(state1.did);
    expect(state2.apiKey).toBe(state1.apiKey);
    expect(state2.baseUrl).toBe(state1.baseUrl);
  });
});
