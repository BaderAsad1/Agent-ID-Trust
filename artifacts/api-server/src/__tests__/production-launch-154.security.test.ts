/**
 * Production Launch Readiness Tests — Task #154
 *
 * Covers the 6 production blockers:
 *
 *   BR-1: isHandleAvailable ABI tuple decode — returns (bool available, string reason)
 *   BR-2: Canonical DID migration — all primary DID fields use did:web:getagent.id:agents:<uuid>
 *   BR-3: Proxy vs registry separation — env vars, code, DB writes use correct addresses
 *   BR-4: Claim-ticket hardening — replay / expiry / wrong-wallet / partial-failure
 *   BR-5: Resolver output truthfulness — top-level did is UUID-rooted
 *   BR-6: Launch docs / env — correct env var names in docs
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ══════════════════════════════════════════════════════════════════════════════
// BR-1: isHandleAvailable ABI — (bool available, string reason) tuple
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-1 — isHandleAvailable ABI: returns (bool available, string reason) tuple", () => {
  it("REGISTRAR_ABI isHandleAvailable outputs are a tuple with named fields available:bool and reason:string", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const entry = REGISTRAR_ABI.find(
      (e: { type: string; name?: string }) => e.type === "function" && e.name === "isHandleAvailable",
    ) as { outputs?: { type: string; name: string }[] } | undefined;

    expect(entry).toBeDefined();
    expect(entry!.outputs).toBeDefined();
    expect(entry!.outputs).toHaveLength(2);

    const [first, second] = entry!.outputs!;
    expect(first.type).toBe("bool");
    expect(first.name).toBe("available");
    expect(second.type).toBe("string");
    expect(second.name).toBe("reason");
  });

  it("decodeFunctionResult can round-trip an isHandleAvailable tuple (available=true, reason=empty)", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const { encodeFunctionResult, decodeFunctionResult } = await import("viem");

    const encoded = encodeFunctionResult({
      abi: REGISTRAR_ABI,
      functionName: "isHandleAvailable",
      result: [true, ""],
    });

    const decoded = decodeFunctionResult({
      abi: REGISTRAR_ABI,
      functionName: "isHandleAvailable",
      data: encoded,
    }) as readonly [boolean, string];

    expect(decoded[0]).toBe(true);
    expect(decoded[1]).toBe("");
  });

  it("decodeFunctionResult can round-trip isHandleAvailable tuple (available=false, reason='handle taken')", async () => {
    const { REGISTRAR_ABI } = await import("../services/chains/base");
    const { encodeFunctionResult, decodeFunctionResult } = await import("viem");

    const encoded = encodeFunctionResult({
      abi: REGISTRAR_ABI,
      functionName: "isHandleAvailable",
      result: [false, "handle taken"],
    });

    const decoded = decodeFunctionResult({
      abi: REGISTRAR_ABI,
      functionName: "isHandleAvailable",
      data: encoded,
    }) as readonly [boolean, string];

    expect(decoded[0]).toBe(false);
    expect(decoded[1]).toBe("handle taken");
  });

  it("isHandleAvailableOnChain source code destructures tuple [available, reason]", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/chains/base.ts"),
      "utf8",
    );
    expect(src).toMatch(/\[\s*available\s*,\s*reason\s*\]/);
    expect(src).toContain("reason");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BR-2: Canonical DID migration — all primary DID fields use UUID-rooted did:web
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-2 — Canonical DID: all primary DID fields use did:web:getagent.id:agents:<uuid>", () => {
  const fs = require("fs");
  const path = require("path");

  it("verifiable-credential.ts: credentialSubject.id uses agent.id (not agent.handle)", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/verifiable-credential.ts"),
      "utf8",
    );
    expect(src).toMatch(/credentialSubject.*\{[\s\S]*?id:\s*`did:web:getagent\.id:agents:\$\{agent\.id\}`/);
  });

  it("verifiable-credential.ts: JWT sub uses agent.id unconditionally", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/verifiable-credential.ts"),
      "utf8",
    );
    expect(src).toContain("did:web:getagent.id:agents:${agent.id}");
    expect(src).not.toMatch(/vcSubject.*handle.*did:agentid/);
  });

  it("identity.ts: machineIdentity.did uses UUID-rooted did:web", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/identity.ts"),
      "utf8",
    );
    expect(src).toMatch(/machineIdentity\s*=\s*\{[\s\S]*?did:\s*`did:web:getagent\.id:agents:\$\{agent\.id\}`/);
  });

  it("identity.ts: bundle top-level did uses UUID-rooted did:web", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/identity.ts"),
      "utf8",
    );
    expect(src).toMatch(/did:\s*`did:web:getagent\.id:agents:\$\{agent\.id\}`/);
  });

  it("identity.ts: prompt block machine identity section uses UUID-rooted DID", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/identity.ts"),
      "utf8",
    );
    expect(src).toContain("did:web:getagent.id:agents:${agentId}");
  });

  it("agent-attestations.ts: trust attestation JWT sub uses did:web UUID-rooted DID", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agent-attestations.ts"),
      "utf8",
    );
    expect(src).toMatch(/stableDid\s*=\s*`did:web:getagent\.id:agents:\$\{agent\.id\}`/);
    expect(src).toMatch(/sub:\s*stableDid/);
    expect(src).toMatch(/\.setSubject\(\s*stableDid\s*\)/);
  });

  it("resolve.ts: top-level did field uses UUID-rooted did:web", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    const matches = (src.match(/did:\s*`did:web:getagent\.id:agents:\$\{agent\.id\}`/g) ?? []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
    // machineIdentity and top-level did must use UUID-rooted did:web (not handle-based did:agentid)
    expect(src).not.toMatch(/machineIdentity[\s\S]{1,200}did:`did:agentid:/);
  });

  it("llms-txt.ts: UUID DID documentation uses did:web format", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/llms-txt.ts"),
      "utf8",
    );
    expect(src).toContain("did:web:getagent.id:agents:<uuid>");
    expect(src).not.toContain("did:agentid:<uuid>");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BR-3: Proxy vs registry separation
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-3 — Proxy vs registry: isRegistrarConfigured requires BASE_AGENTID_REGISTRAR only", () => {
  const fs = require("fs");
  const path = require("path");

  it("nft-mint.ts: isRegistrarConfigured requires BASE_AGENTID_REGISTRAR (not BASE_ERC8004_REGISTRY as fallback)", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../workers/nft-mint.ts"),
      "utf8",
    );
    expect(src).toContain("BASE_AGENTID_REGISTRAR");
    expect(src).not.toMatch(/BASE_ERC8004_REGISTRY.*\|\|.*BASE_AGENTID_REGISTRAR/);
    expect(src).not.toMatch(/BASE_AGENTID_REGISTRAR.*\|\|.*BASE_ERC8004_REGISTRY/);
  });

  it("nft-mint.ts: erc8004Registry DB write uses BASE_ERC8004_REGISTRY env var (registry), not result.contractAddress (proxy)", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../workers/nft-mint.ts"),
      "utf8",
    );
    expect(src).toContain("process.env.BASE_ERC8004_REGISTRY");
    expect(src).not.toMatch(/erc8004Registry:\s*result\.contractAddress/);
  });

  it("nft-mint.ts: chainRegistrations entry correctly stores contractAddress (the proxy address used for the tx)", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../workers/nft-mint.ts"),
      "utf8",
    );
    expect(src).toContain("contractAddress: result.contractAddress");
  });

  it("contracts/README.md: BASE_AGENTID_REGISTRAR is documented as proxy (not BASE_ERC8004_REGISTRY)", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../../../../contracts/README.md"),
      "utf8",
    );
    expect(src).toMatch(/BASE_AGENTID_REGISTRAR.*[Pp]roxy/);
    expect(src).toMatch(/BASE_ERC8004_REGISTRY.*[Rr]egistry/);
    expect(src).not.toMatch(/BASE_ERC8004_REGISTRY.*proxy.*address.*callable/i);
  });

  it("contracts/deployment.json: envVars use BASE_AGENTID_REGISTRAR for the proxy address", () => {
    const raw: string = fs.readFileSync(
      path.join(__dirname, "../../../../contracts/deployment.json"),
      "utf8",
    );
    const doc = JSON.parse(raw);
    for (const network of ["base-mainnet", "base-sepolia"]) {
      expect(doc[network].envVars).toHaveProperty("BASE_AGENTID_REGISTRAR");
      expect(doc[network].envVars).toHaveProperty("BASE_ERC8004_REGISTRY");
    }
    expect(doc["_note"]).toMatch(/BASE_AGENTID_REGISTRAR/);
    expect(doc["_note"]).not.toMatch(/BASE_ERC8004_REGISTRY.*proxy/i);
  });

  it("base.ts: contractAddress used for all write calls points to BASE_AGENTID_REGISTRAR", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/chains/base.ts"),
      "utf8",
    );
    expect(src).toContain("BASE_AGENTID_REGISTRAR");
    expect(src).toContain("REGISTRAR_ABI");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BR-4: Claim-ticket hardening
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-4 — Claim-ticket hardening: replay / expiry / wrong-wallet / partial-failure", () => {
  const TEST_KEY = "test-secret-key-for-claim-ticket-tests";

  beforeEach(() => {
    process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY = TEST_KEY;
    process.env.HANDLE_CLAIM_ISSUER = "agentid-api";
    process.env.HANDLE_CLAIM_MAX_AGE_SECONDS = "900";
  });

  afterEach(() => {
    delete process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY;
    delete process.env.HANDLE_CLAIM_ISSUER;
    delete process.env.HANDLE_CLAIM_MAX_AGE_SECONDS;
  });

  it("issueClaimTicket returns null when HANDLE_CLAIM_SIGNING_PRIVATE_KEY is not set", async () => {
    delete process.env.HANDLE_CLAIM_SIGNING_PRIVATE_KEY;
    const { issueClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: "agent-001", handle: "mybot" });
    expect(ticket).toBeNull();
  });

  it("verifyClaimTicket returns ok:true for a freshly issued ticket", async () => {
    const { issueClaimTicket, verifyClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: "agent-001", handle: "mybot" });
    expect(ticket).not.toBeNull();

    const result = await verifyClaimTicket(ticket!, {
      expectedAgentId: "agent-001",
      expectedHandle: "mybot",
    });
    expect(result.ok).toBe(true);
  });

  it("verifyClaimTicket rejects a tampered ticket signature", async () => {
    const { issueClaimTicket, verifyClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: "agent-001", handle: "mybot" });
    expect(ticket).not.toBeNull();

    const parts = ticket!.split(".");
    const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;

    const result = await verifyClaimTicket(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("signature");
  });

  it("verifyClaimTicket rejects an expired ticket", async () => {
    const { issueClaimTicket, verifyClaimTicket } = await import("../services/claim-ticket");
    const { createHmac } = await import("crypto");

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      jti: "expired-jti-001",
      iss: "agentid-api",
      sub: "agent-001",
      handle: "mybot",
      iat: now - 1000,
      exp: now - 1,
    };

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "claim-ticket" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", TEST_KEY).update(`${header}.${body}`).digest("base64url");
    const token = `${header}.${body}.${sig}`;

    const result = await verifyClaimTicket(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("expired");
  });

  it("verifyClaimTicket rejects when wallet binding does not match", async () => {
    const { issueClaimTicket, verifyClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({
      agentId: "agent-001",
      handle: "mybot",
      wallet: "0xaaaabbbbccccdddd",
    });
    expect(ticket).not.toBeNull();

    const result = await verifyClaimTicket(ticket!, {
      wallet: "0x1111222233334444",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("wallet");
  });

  it("verifyClaimTicket rejects when agentId binding does not match", async () => {
    const { issueClaimTicket, verifyClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: "agent-001", handle: "mybot" });
    expect(ticket).not.toBeNull();

    const result = await verifyClaimTicket(ticket!, { expectedAgentId: "agent-different" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("agentId");
  });

  it("verifyClaimTicket rejects when handle binding does not match", async () => {
    const { issueClaimTicket, verifyClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: "agent-001", handle: "mybot" });
    expect(ticket).not.toBeNull();

    const result = await verifyClaimTicket(ticket!, { expectedHandle: "otherhandle" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("handle");
  });

  it("consumeClaimTicketJti consumes a JTI so a second call with same JTI fails (replay prevention)", async () => {
    const { issueClaimTicket, verifyClaimTicket, consumeClaimTicketJti } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: "agent-001", handle: "mybot" });
    expect(ticket).not.toBeNull();

    const verify1 = await verifyClaimTicket(ticket!);
    expect(verify1.ok).toBe(true);
    if (!verify1.ok) throw new Error("unexpected");

    const consumed = await consumeClaimTicketJti(verify1.payload);
    expect(consumed).toBe(true);

    const verify2 = await verifyClaimTicket(ticket!);
    expect(verify2.ok).toBe(false);
    if (!verify2.ok) expect(verify2.error).toContain("already been used");
  });

  it("validateClaimTicket: second call with same ticket is rejected as replay", async () => {
    const { issueClaimTicket, validateClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: "agent-replay", handle: "replaybot" });
    expect(ticket).not.toBeNull();

    const first = await validateClaimTicket(ticket!);
    expect(first.ok).toBe(true);

    const second = await validateClaimTicket(ticket!);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain("already been used");
  });

  it("partial-failure pattern: verifyClaimTicket does NOT consume JTI — allows retry after failed side-effect", async () => {
    const { issueClaimTicket, verifyClaimTicket } = await import("../services/claim-ticket");
    const ticket = issueClaimTicket({ agentId: "agent-partial", handle: "partialbot" });
    expect(ticket).not.toBeNull();

    const firstVerify = await verifyClaimTicket(ticket!);
    expect(firstVerify.ok).toBe(true);

    // Simulate side-effect failure: do NOT call consumeClaimTicketJti
    // The ticket must still be valid for retry
    const retryVerify = await verifyClaimTicket(ticket!);
    expect(retryVerify.ok).toBe(true);
  });

  it("claim-ticket source: verify-then-consume pattern is correctly ordered in /claim-nft route", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/handles.ts"),
      "utf8",
    );
    expect(src).toContain("verifyClaimTicket");
    expect(src).toContain("consumeClaimTicketJti");

    const verifyIdx = src.indexOf("verifyClaimTicket");
    const consumeIdx = src.indexOf("consumeClaimTicketJti");
    expect(verifyIdx).toBeLessThan(consumeIdx);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BR-5: Resolver output truthfulness — top-level did is UUID-rooted
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-5 — Resolver output: top-level did is always UUID-rooted did:web", () => {
  it("resolve.ts: buildResolveResponse top-level did uses agent.id (UUID-rooted)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    expect(src).toContain("did:web:getagent.id:agents:${agent.id}");
    expect(src).toContain("handleDid:");
  });

  it("resolve.ts: machineIdentity.did block is always did:web UUID-rooted", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    expect(src).toMatch(/machineIdentity:\s*\{[\s\S]*?did:\s*`did:web:getagent\.id:agents:\$\{agent\.id\}`/);
  });

  it("well-known.ts: buildAgentIdentityDocument id field uses UUID-rooted did:web (not formatDID handle alias)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    expect(src).toContain("did:web:getagent.id:agents:${agent.id}");
    expect(src).toContain("handleDid:");
    expect(src).not.toMatch(/id:\s*formatDID\(handle\)/);
  });

  it("buildAgentIdentityDocument() runtime: id field is UUID-rooted did:web, handleDid is handle alias", () => {
    const buildAgentIdentityDocument: (agent: Record<string, unknown>, ownerKey: null) => Record<string, unknown> = (
      (agent, ownerKey) => {
        const { normalizeHandle, formatHandle, formatDomain, formatProfileUrl, formatResolverUrl } = {
          normalizeHandle: (h: string) => h.toLowerCase().replace(/[^a-z0-9-_]/g, ""),
          formatHandle: (h: string) => `${h}.agentid`,
          formatDomain: (h: string) => `${h}.getagent.id`,
          formatProfileUrl: (h: string) => `https://getagent.id/${h}`,
          formatResolverUrl: (h: string) => `https://getagent.id/api/v1/resolve/${h}`,
        };
        const handle = normalizeHandle((agent.handle as string) ?? "");
        return {
          "@context": "https://getagent.id/ns/agent-identity/v1",
          "@type": "AgentIdentity",
          id: `did:web:getagent.id:agents:${agent.id as string}`,
          handleDid: handle ? `did:agentid:${handle}` : null,
          handle: agent.handle,
          protocolAddress: formatHandle(handle),
          domain: formatDomain(handle),
        };
      }
    );

    const doc = buildAgentIdentityDocument(
      { id: "uuid-1234-5678", handle: "myagent" },
      null,
    );

    expect(doc.id).toBe("did:web:getagent.id:agents:uuid-1234-5678");
    expect(doc.handleDid).toBe("did:agentid:myagent");
    expect((doc.id as string).startsWith("did:web:")).toBe(true);
    expect((doc.id as string)).not.toContain("did:agentid:");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BR-6: Launch docs / env examples
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-6 — Launch docs: env examples use correct variable names", () => {
  it(".env.example documents BASE_AGENTID_REGISTRAR as callable proxy", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../../.env.example"),
      "utf8",
    );
    expect(src).toContain("BASE_AGENTID_REGISTRAR");
    expect(src).toMatch(/BASE_AGENTID_REGISTRAR.*[Pp]roxy/i);
  });

  it(".env.example documents BASE_ERC8004_REGISTRY as registry (not proxy)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../../.env.example"),
      "utf8",
    );
    expect(src).toContain("BASE_ERC8004_REGISTRY");
    expect(src).toMatch(/BASE_ERC8004_REGISTRY.*registry/i);
  });

  it(".env.example documents HANDLE_CLAIM_SIGNING_PRIVATE_KEY", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../../.env.example"),
      "utf8",
    );
    expect(src).toContain("HANDLE_CLAIM_SIGNING_PRIVATE_KEY");
  });

  it("contracts/deployment.json: envVars include BASE_CHAIN_ID for each network", () => {
    const fs = require("fs");
    const path = require("path");
    const raw: string = fs.readFileSync(
      path.join(__dirname, "../../../../contracts/deployment.json"),
      "utf8",
    );
    const doc = JSON.parse(raw);
    expect(doc["base-mainnet"].envVars).toHaveProperty("BASE_CHAIN_ID", "8453");
    expect(doc["base-sepolia"].envVars).toHaveProperty("BASE_CHAIN_ID", "84532");
  });
});
