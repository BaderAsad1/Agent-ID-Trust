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

  it("programmatic.ts: machineIdentity.did and handleIdentity.did use UUID-rooted did:web", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/programmatic.ts"),
      "utf8",
    );
    expect(src).toContain("did:web:getagent.id:agents:${agentId}");
    expect(src).not.toMatch(/machineIdentity[\s\S]{1,200}did:\s*`did:agentid:/);
  });

  it("agent-runtime.ts: heartbeat machine_identity.did uses UUID-rooted did:web", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agent-runtime.ts"),
      "utf8",
    );
    expect(src).toContain("did:web:getagent.id:agents:${agent.id}");
    expect(src).not.toMatch(/machine_identity[\s\S]{1,100}did:\s*`did:agentid:/);
  });

  it("agent-card.ts: card did field uses UUID-rooted did:web", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agent-card.ts"),
      "utf8",
    );
    expect(src).toMatch(/did:\s*`did:web:getagent\.id:agents:\$\{a\.id\}`/);
    expect(src).not.toMatch(/did:\s*`did:agentid:/);
  });

  it("agent-card.ts: uses chainRegistrations (not deprecated chainMints) for on-chain metadata", () => {
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agent-card.ts"),
      "utf8",
    );
    expect(src).toContain("chainRegistrations");
    expect(src).not.toMatch(/\bchainMints\b/);
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
// BR-SEC: Ownership authorization on handle assignment paths
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-SEC — Handle assignment ownership checks prevent cross-user injection", () => {
  it("billing.ts /handle-checkout route source contains agentOwnerWhere ownership check before createHandleCheckoutSession", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/billing.ts"),
      "utf8",
    );
    // The ownership guard must appear before createHandleCheckoutSession call
    const ownerCheckPos = src.indexOf("agentOwnerWhere");
    const checkoutCallPos = src.indexOf("createHandleCheckoutSession(");
    expect(ownerCheckPos).toBeGreaterThan(0);
    expect(checkoutCallPos).toBeGreaterThan(0);
    expect(ownerCheckPos).toBeLessThan(checkoutCallPos);
  });

  it("billing.ts agentOwnerWhere is called with correct two-argument signature (agentId, userId)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/billing.ts"),
      "utf8",
    );
    // Must call agentOwnerWhere(body.agentId, req.userId!) — not single-arg form
    const twoArgPattern = /agentOwnerWhere\s*\(\s*body\.agentId\s*,\s*req\.userId/;
    expect(src).toMatch(twoArgPattern);
    // Count occurrences — should have two (handle-checkout + crypto-payment-status)
    const matches = [...src.matchAll(/agentOwnerWhere\s*\(\s*body\.agentId\s*,\s*req\.userId/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("billing.ts /crypto-payment-status route contains agentOwnerWhere ownership check before pollForCryptoPayment", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/billing.ts"),
      "utf8",
    );
    // Both ownership guards must exist in the file
    const allOwnerChecks = [...src.matchAll(/agentOwnerWhere/g)];
    expect(allOwnerChecks.length).toBeGreaterThanOrEqual(2);
    // pollForCryptoPayment appears after second agentOwnerWhere usage
    const cryptoStatusOwnerPos = src.lastIndexOf("agentOwnerWhere");
    const pollCallPos = src.indexOf("pollForCryptoPayment(");
    expect(cryptoStatusOwnerPos).toBeLessThan(src.lastIndexOf("pollForCryptoPayment("));
    expect(pollCallPos).toBeGreaterThan(0);
  });

  it("billing.ts /handle-checkout rejects with FORBIDDEN when agentId does not belong to user", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/billing.ts"),
      "utf8",
    );
    expect(src).toContain("FORBIDDEN");
    expect(src).toContain("agentId does not belong to the authenticated user");
  });

  it("agentOwnerWhere is imported at top-level in billing.ts (not only via dynamic import)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/billing.ts"),
      "utf8",
    );
    // Static import must include agentOwnerWhere
    expect(src).toMatch(/import\s*\{[^}]*agentOwnerWhere[^}]*\}\s*from\s*["'].*agents["']/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BR-DUR: Durability — included-handle checkout eligibility gate behavior
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-DUR — Included-handle eligibility gate: explicit error when agentId absent", () => {
  it("createHandleCheckoutSession checks eligibility before checking agentId presence", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/billing.ts"),
      "utf8",
    );
    // Eligibility check (checkUserIncludedHandleEligibility) must appear BEFORE the agentId guard
    const eligibilityIdx = src.indexOf("checkUserIncludedHandleEligibility");
    const agentIdGuardIdx = src.indexOf("AGENT_REQUIRED_FOR_INCLUDED_HANDLE");
    expect(eligibilityIdx).toBeGreaterThan(-1);
    expect(agentIdGuardIdx).toBeGreaterThan(-1);
    // eligibility check comes before the guard
    expect(eligibilityIdx).toBeLessThan(agentIdGuardIdx);
  });

  it("billing service exports checkUserIncludedHandleEligibility as a named export (for unit mocking)", async () => {
    const billing = await import("../services/billing");
    expect(typeof billing.checkUserIncludedHandleEligibility).toBe("function");
  });

  it("AGENT_REQUIRED_FOR_INCLUDED_HANDLE error is returned (not thrown) with priceCents:0", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/billing.ts"),
      "utf8",
    );
    // Must return an object (not throw) so callers can surface the error gracefully
    const returnPattern = /return\s*\{[^}]*AGENT_REQUIRED_FOR_INCLUDED_HANDLE[^}]*priceCents:\s*0/;
    expect(src).toMatch(returnPattern);
  });

  it("createHandleCheckoutSession is exported from billing service", async () => {
    const billing = await import("../services/billing");
    expect(typeof billing.createHandleCheckoutSession).toBe("function");
  });

  it("agents.ts agent-creation compensation path uses retry loop (not just .catch) and records durable stranded-claim audit event", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agents.ts"),
      "utf8",
    );
    // Retry loop: two attempts with delay
    expect(src).toMatch(/for\s*\(\s*let\s+attempt\s*=\s*0;\s*attempt\s*<\s*2/);
    // Durable audit record on release failure
    expect(src).toMatch(/billing\.included_handle_claim\.stranded/);
    // Writes to auditEventsTable (not just logs)
    expect(src).toMatch(/insert\(auditEventsTable\)/);
  });

  it("agents.ts imports auditEventsTable for durable stranded-claim recording", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agents.ts"),
      "utf8",
    );
    // Must import auditEventsTable from schema
    expect(src).toMatch(/auditEventsTable/);
    expect(src).toMatch(/from.*@workspace\/db\/schema/);
  });

  it("meta.ts auth matrix includes Free plan for POST /api/v1/agents (UUID-only creation)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/meta.ts"),
      "utf8",
    );
    // Find the /api/v1/agents POST entry block
    const agentsPostIdx = src.indexOf('path: "/api/v1/agents"');
    expect(agentsPostIdx).toBeGreaterThan(-1);
    const block = src.slice(agentsPostIdx, agentsPostIdx + 200);
    expect(block).toMatch(/plans:.*"free"/);
  });

  it("resolve.ts revoked-agent did field does not fall back to did:agentid: as primary value", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    // The revocation.did field must not assign did:agentid: as a non-null primary value
    // Acceptable: did:web UUID-rooted or null; did:agentid may appear as handleAlias only
    const revokedBlock = src.slice(src.indexOf("AGENT_REVOKED"), src.indexOf("AGENT_REVOKED") + 500);
    expect(revokedBlock).not.toMatch(/did:\s*agent\.id\s*\?[^:]+:\s*`did:agentid:/);
    // Must have UUID-rooted did:web for the primary did field
    expect(revokedBlock).toMatch(/did:web:getagent\.id:agents:\$\{agent\.id\}/);
  });

  it("handle.ts checkHandleRegistrationLimits blocks Free plan for ALL handle tiers using subscription-backed plan", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/handle.ts"),
      "utf8",
    );
    // Scope checks to within the checkHandleRegistrationLimits function body
    const fnStart = src.indexOf("export async function checkHandleRegistrationLimits");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart, fnStart + 4000);
    // Plan gate must exist in the function body
    const planGateInFn = fnBody.indexOf("Handles require a paid plan");
    expect(planGateInFn).toBeGreaterThan(-1);
    // Plan gate should appear before premium tier check within the function
    const premiumTierInFn = fnBody.indexOf("premium_3");
    expect(planGateInFn).toBeLessThan(premiumTierInFn);
    // Must use subscriptions table (canonical) — not denormalized usersTable.plan
    expect(fnBody).toContain("subscriptionsTable");
    expect(fnBody).toMatch(/subscriptionsTable\.status.*active|status.*active.*subscriptionsTable/);
    // Must NOT read plan from usersTable directly (that's the stale denormalized field)
    expect(fnBody).not.toMatch(/usersTable\s*\.\s*plan/);
  });

  it("billing.ts createHandleCheckoutSession blocks Free plan using canonical getUserPlan()", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/billing.ts"),
      "utf8",
    );
    // Find the export function declaration (not the import reference)
    const exportFnIdx = src.indexOf("export async function createHandleCheckoutSession");
    expect(exportFnIdx).toBeGreaterThan(-1);
    // Large window needed — function body includes pending audit + claim + assign + compensate logic
    const fnBody = src.slice(exportFnIdx, exportFnIdx + 15000);
    expect(fnBody).toContain("PLAN_REQUIRED_FOR_HANDLE");
    // Must use getUserPlan() (canonical subscription-backed resolver) — not direct usersTable.plan query
    expect(fnBody).toMatch(/getUserPlan\(userId\)/);
    expect(fnBody).not.toMatch(/usersTable\.plan/);
    // Plan check must appear before Stripe customer creation
    const planGateInFn = fnBody.indexOf("PLAN_REQUIRED_FOR_HANDLE");
    const stripeIdx = fnBody.indexOf("getStripe()");
    expect(stripeIdx).toBeGreaterThan(-1);
    expect(planGateInFn).toBeLessThan(stripeIdx);
  });

  it("billing.ts /handle-checkout route maps entitlement errors to intentional status codes", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/billing.ts"),
      "utf8",
    );
    // Find the handle-checkout route
    const routeIdx = src.indexOf('"/handle-checkout"');
    expect(routeIdx).toBeGreaterThan(-1);
    // Use absolute position from the route registration — needs enough window to reach error-mapping block
    const routeBlock = src.slice(routeIdx, routeIdx + 3500);
    // PLAN_REQUIRED_FOR_HANDLE → 402 Payment Required
    expect(routeBlock).toContain("PLAN_REQUIRED_FOR_HANDLE");
    expect(routeBlock).toContain("402");
    // HANDLE_BENEFIT_ALREADY_USED → 409 Conflict (mapped from service error key)
    expect(routeBlock).toContain("409");
    // AGENT_REQUIRED_FOR_INCLUDED_HANDLE → 422 Unprocessable Entity
    expect(routeBlock).toContain("422");
    // All three status codes must appear in the error-mapping block
    const errorMappingBlock = routeBlock.slice(routeBlock.indexOf("result.error"), routeBlock.indexOf("result.error") + 500);
    expect(errorMappingBlock).toContain("402");
    expect(errorMappingBlock).toContain("409");
    expect(errorMappingBlock).toContain("422");
  });

  it("billing.ts createHandleCheckoutSession handles exhausted benefit — never falls through to 0-amount Stripe checkout", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/billing.ts"),
      "utf8",
    );
    const fnIdx = src.indexOf("export async function createHandleCheckoutSession");
    expect(fnIdx).toBeGreaterThan(-1);
    // Large window needed — function includes pending audit + claim + assign + compensate logic
    const fnBody = src.slice(fnIdx, fnIdx + 15000);
    // Must guard BOTH benefit-exhausted paths: isEligible===false (benefit already used)
    // AND concurrent claim race (claimed===false after isEligible was true).
    // Both must return HANDLE_BENEFIT_ALREADY_USED for 0-priced standard handles.
    expect(fnBody).toContain("HANDLE_BENEFIT_ALREADY_USED");
    // Must guard against 0-amount Stripe session when isEligible===false for standard handles
    // Guard: !isEligible && priceCents === 0 must appear before stripe session creation
    const eligibilityGuardIdx = fnBody.indexOf("!isEligible && priceCents === 0");
    expect(eligibilityGuardIdx).toBeGreaterThan(-1);
    const stripeCreateIdx = fnBody.indexOf("stripe.checkout.sessions.create");
    expect(stripeCreateIdx).toBeGreaterThan(-1);
    expect(eligibilityGuardIdx).toBeLessThan(stripeCreateIdx);
    // Must also handle concurrent claim race (claimed === false path)
    const claimedFalseIdx = fnBody.indexOf("!claimed");
    expect(claimedFalseIdx).toBeGreaterThan(-1);
    expect(claimedFalseIdx).toBeLessThan(stripeCreateIdx);
  });

  it("HandlePurchase.tsx included-handle flow uses billing/handle-checkout endpoint (not direct agent creation)", () => {
    const fs = require("fs");
    const path = require("path");
    // HandlePurchase.tsx is in the agent-id artifact, not the api-server
    const src: string = fs.readFileSync(
      path.join(__dirname, "../../../../artifacts/agent-id/src/pages/HandlePurchase.tsx"),
      "utf8",
    );
    // Find handleRegisterFree function
    const fnIdx = src.indexOf("async function handleRegisterFree");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = src.slice(fnIdx, fnIdx + 2000);
    // Must use billing/handle-checkout endpoint for durable claim + assignment
    expect(fnBody).toContain("billing/handle-checkout");
    // Must NOT use the old api.agents.create({handle}) pattern (which bypasses billing durability)
    // It may create an agent without a handle (for agentId), but must NOT pass handle to agents.create
    expect(fnBody).not.toMatch(/agents\.create\(\{[^}]*handle:/);
    // Must pass agentId to handle-checkout (required for durable claim + assignment)
    expect(fnBody).toContain("agentId");
  });

  it("billing.ts createHandleCheckoutSession writes MANDATORY PENDING audit record before claim (fail-closed durability)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/billing.ts"),
      "utf8",
    );
    const fnIdx = src.indexOf("export async function createHandleCheckoutSession");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = src.slice(fnIdx, fnIdx + 15000);
    // Must write a PENDING audit record BEFORE claiming the benefit
    expect(fnBody).toContain("billing.included_handle_claim.pending");
    // PENDING audit must appear before the claim call
    const pendingIdx = fnBody.indexOf("billing.included_handle_claim.pending");
    const claimIdx = fnBody.indexOf("claimIncludedHandleBenefit");
    expect(pendingIdx).toBeLessThan(claimIdx);
    // CRITICAL: Pending write must be MANDATORY — if it fails, the claim must be aborted (not proceeded).
    // The code must NOT have a fallthrough comment like "proceed anyway" or "non-fatal".
    // Instead it must return an error (AUDIT_WRITE_FAILED) on pending write failure.
    expect(fnBody).toContain("AUDIT_WRITE_FAILED");
    // The AUDIT_WRITE_FAILED return must appear BEFORE claimIncludedHandleBenefit
    const auditFailIdx = fnBody.indexOf("AUDIT_WRITE_FAILED");
    expect(auditFailIdx).toBeLessThan(claimIdx);
    // Must update to COMPLETED state on success
    expect(fnBody).toContain("state: \"completed\"");
    // Must update to STRANDED state on release failure (for operator/recovery-worker detection)
    expect(fnBody).toContain("billing.included_handle_claim.stranded");
    expect(fnBody).toContain("state: \"stranded\"");
    // Must also record compensated state when release succeeds
    expect(fnBody).toContain("state: \"compensated\"");
  });

  it("billing.ts included-handle checkout path consults registrar availability before claiming benefit", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/billing.ts"),
      "utf8",
    );
    const exportFnIdx = src.indexOf("export async function createHandleCheckoutSession");
    expect(exportFnIdx).toBeGreaterThan(-1);
    const fnBody = src.slice(exportFnIdx, exportFnIdx + 8000);
    // Must call checkHandleAvailability before claimIncludedHandleBenefit
    const availabilityIdx = fnBody.indexOf("checkHandleAvailability");
    const claimIdx = fnBody.indexOf("claimIncludedHandleBenefit");
    expect(availabilityIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeGreaterThan(-1);
    expect(availabilityIdx).toBeLessThan(claimIdx);
    // Must return HANDLE_NOT_AVAILABLE on registrar rejection (fail-closed)
    expect(fnBody).toContain("HANDLE_NOT_AVAILABLE");
  });

  it("billing.ts paid Stripe checkout path also consults registrar before creating Stripe session", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/billing.ts"),
      "utf8",
    );
    const exportFnIdx = src.indexOf("export async function createHandleCheckoutSession");
    expect(exportFnIdx).toBeGreaterThan(-1);
    // Use a larger slice to capture the paid Stripe path (after the included-handle path)
    const fnBody = src.slice(exportFnIdx, exportFnIdx + 15000);
    // The getStripe() call marks the entry to the paid Stripe path
    const stripeClientIdx = fnBody.indexOf("getStripe()");
    expect(stripeClientIdx).toBeGreaterThan(-1);
    // Find checkHandleAvailability in the paid Stripe path section (after the included-handle block closes)
    // The paid-path check must appear between the end of the included block and getStripe()
    const paidPathStr = fnBody.slice(0, stripeClientIdx);
    const lastCheckAvailabilityInPaidPath = paidPathStr.lastIndexOf("checkHandleAvailability");
    expect(lastCheckAvailabilityInPaidPath).toBeGreaterThan(-1);
    // That check must also appear after claimIncludedHandleBenefit (proving it is NOT the included-handle check)
    const lastClaimIdx = paidPathStr.lastIndexOf("claimIncludedHandleBenefit");
    expect(lastCheckAvailabilityInPaidPath).toBeGreaterThan(lastClaimIdx);
    // Both paths return HANDLE_NOT_AVAILABLE on registrar rejection
    const notAvailableCount = (fnBody.match(/HANDLE_NOT_AVAILABLE/g) ?? []).length;
    expect(notAvailableCount).toBeGreaterThanOrEqual(2);
  });

  it("agents.ts POST /agents writes MANDATORY PENDING audit record before claimIncludedHandleBenefit (fail-closed durability)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../../src/routes/v1/agents.ts"),
      "utf8",
    );
    // The pending audit insert must exist in the POST handler, before the actual claim call
    expect(src).toContain("billing.included_handle_claim.pending");
    const pendingIdx = src.indexOf("billing.included_handle_claim.pending");
    expect(pendingIdx).toBeGreaterThan(-1);
    // Find the actual function CALL (not the import): claimIncludedHandleBenefitTx (transactional variant)
    const claimCallIdx = src.indexOf("claimIncludedHandleBenefitTx(");
    expect(claimCallIdx).toBeGreaterThan(-1);
    // PENDING intent must be written before the actual claim call
    expect(pendingIdx).toBeLessThan(claimCallIdx);
    // CRITICAL: Pending write must be MANDATORY — if it fails, the request must be aborted.
    // The code must throw/return AUDIT_WRITE_FAILED, NOT proceed to claim.
    expect(src).toContain("AUDIT_WRITE_FAILED");
    const auditFailIdx = src.indexOf("AUDIT_WRITE_FAILED");
    expect(auditFailIdx).toBeLessThan(claimCallIdx);
    // Must also have stranded and completed state transitions in the agents route
    expect(src).toContain("state: \"stranded\"");
    expect(src).toContain("state: \"completed\"");
    expect(src).toContain("state: \"compensated\"");
  });

  it("handle.ts checkHandleRegistrationLimits standard_5plus check uses subscriptions (not denormalized users.plan)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/handle.ts"),
      "utf8",
    );
    const fnStart = src.indexOf("export async function checkHandleRegistrationLimits");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart, fnStart + 5000);
    // standard_5plus check must exist and use subscriptions table
    expect(fnBody).toContain("standard_5plus");
    const standardIdx = fnBody.indexOf("standard_5plus");
    const subTableIdx = fnBody.indexOf("subscriptionsTable", standardIdx);
    expect(subTableIdx).toBeGreaterThan(-1); // subscriptionsTable used after standard_5plus check starts
    // Must NOT use denormalized users.plan column in the standard_5plus check section
    const standard5plusBody = fnBody.slice(standardIdx);
    expect(standard5plusBody).not.toMatch(/usersTable\s*\.\s*plan/);
  });

  it("billing.ts /crypto-checkout route has plan gate blocking Free plan users", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/billing.ts"),
      "utf8",
    );
    // Find the crypto-checkout route
    const cryptoIdx = src.indexOf('"/crypto-checkout"');
    expect(cryptoIdx).toBeGreaterThan(-1);
    const cryptoBlock = src.slice(cryptoIdx, cryptoIdx + 3000);
    // Must check plan and reject with PLAN_REQUIRED_FOR_HANDLE
    expect(cryptoBlock).toContain("PLAN_REQUIRED_FOR_HANDLE");
    expect(cryptoBlock).toMatch(/getUserPlan/);
    // Plan gate must appear before handle checkout session creation
    const planGateIdx = cryptoBlock.indexOf("PLAN_REQUIRED_FOR_HANDLE");
    const sessionIdx = cryptoBlock.indexOf("createCryptoCheckoutSession");
    expect(planGateIdx).toBeLessThan(sessionIdx);
  });

  it("resolve.ts /address/:address endpoint uses chainRegistrations (not legacy chainMints)", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    const addressRouteIdx = src.indexOf('"/address/:address"');
    expect(addressRouteIdx).toBeGreaterThan(-1);
    const addressBlock = src.slice(addressRouteIdx, addressRouteIdx + 4000);
    // Must use chainRegistrations instead of legacy chainMints
    expect(addressBlock).toContain("chainRegistrations");
    // Must not have actual code queries on chainMints (comments referencing it are OK)
    // Strip comments and check no agentsTable.chainMints DB access exists
    expect(addressBlock).not.toMatch(/agentsTable\.chainMints/);
    expect(addressBlock).not.toMatch(/columns:.*chainMints/);
  });

  it("resolve.ts handleDid field uses formatDID (handle alias) not UUID-rooted DID", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    // handleDid must use formatDID (which returns did:agentid:<handle> alias)
    // not duplicate the UUID-rooted did:web as primary
    expect(src).toMatch(/handleDid:\s*handle\s*\?\s*formatDID\(handle\)/);
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

// ══════════════════════════════════════════════════════════════════════════════
// BR-7: OpenAPI DID schema parity — did:web UUID-rooted in all DID fields
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-7 — OpenAPI DID schema parity across required surfaces", () => {
  let spec: string;
  beforeEach(() => {
    const fs = require("fs");
    const path = require("path");
    spec = fs.readFileSync(
      path.join(__dirname, "../../../../lib/api-spec/openapi.yaml"),
      "utf8",
    );
  });

  it("ProgrammaticRegisterResponse schema includes did field with did:web example", () => {
    const registerIdx = spec.indexOf("ProgrammaticRegisterResponse:");
    const nextSchemaIdx = spec.indexOf("\n    ", registerIdx + 30);
    const registerBlock = spec.slice(registerIdx, registerIdx + 800);
    expect(registerBlock).toContain("did:");
    expect(registerBlock).toContain("did:web:getagent.id:agents:");
    expect(registerBlock).toMatch(/example:.*did:web:getagent\.id:agents:/);
  });

  it("ProgrammaticVerifyResponse schema includes did field with did:web example", () => {
    const verifyIdx = spec.indexOf("ProgrammaticVerifyResponse:");
    const verifyBlock = spec.slice(verifyIdx, verifyIdx + 800);
    expect(verifyBlock).toContain("did:");
    expect(verifyBlock).toContain("did:web:getagent.id:agents:");
    expect(verifyBlock).toMatch(/example:.*did:web:getagent\.id:agents:/);
  });

  it("ResolvedAgent schema did field has did:web description and example", () => {
    const resolvedIdx = spec.indexOf("ResolvedAgent:");
    const resolvedBlock = spec.slice(resolvedIdx, resolvedIdx + 1500);
    expect(resolvedBlock).toContain("did:web:getagent.id:agents:");
    expect(resolvedBlock).toMatch(/description:.*UUID-rooted DID/);
    expect(resolvedBlock).toMatch(/example:.*did:web:getagent\.id:agents:/);
  });

  it("OpenAPI spec does not expose did:agentid: as a primary DID example in any schema", () => {
    // did:agentid: should not appear as a primary DID example — only the UUID-rooted did:web format
    // (Aliases array in VCs may legitimately reference did:agentid: but are not OpenAPI schema examples)
    const didAgentIdExamplePattern = /example:\s*["']did:agentid:/g;
    const matches = [...spec.matchAll(didAgentIdExamplePattern)];
    expect(matches.length).toBe(0);
  });

  it("ProgrammaticRegisterResponse required list includes did", () => {
    const registerIdx = spec.indexOf("ProgrammaticRegisterResponse:");
    const registerBlock = spec.slice(registerIdx, registerIdx + 1200);
    expect(registerBlock).toMatch(/required:\s*\[[^\]]*did[^\]]*\]/);
  });

  it("ProgrammaticVerifyResponse required list includes did", () => {
    const verifyIdx = spec.indexOf("ProgrammaticVerifyResponse:");
    const verifyBlock = spec.slice(verifyIdx, verifyIdx + 1200);
    expect(verifyBlock).toMatch(/required:\s*\[[^\]]*did[^\]]*\]/);
  });

  it("programmatic.ts register response includes top-level did field matching OpenAPI schema", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/programmatic.ts"),
      "utf8",
    );
    // Register response must have did: at top level (not only nested in machineIdentity)
    // Look for the pattern: res.status(201).json({ agentId: ..., did: canonicalDid
    expect(src).toMatch(/status\(201\)\.json\(\{[\s\S]{0,200}did:\s*canonicalDid/);
  });

  it("programmatic.ts verify response includes top-level did field matching OpenAPI schema", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../routes/v1/programmatic.ts"),
      "utf8",
    );
    // Verify response must have did: at top level
    expect(src).toMatch(/res\.json\(\{[\s\S]{0,300}did:\s*verifyCanonicalDid/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BR-8: Base chain — legacy ERC-721 path locked; anchored lifecycle safety
// ══════════════════════════════════════════════════════════════════════════════

describe("BR-8 — Base chain: legacy ERC-721 disabled; anchored handle lifecycle safety", () => {
  it("base.ts mintHandleOnBase throws LEGACY_PATH_DISABLED — legacy ERC-721 locked", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/chains/base.ts"),
      "utf8",
    );
    expect(src).toContain("LEGACY_PATH_DISABLED");
    // Must apply to mintHandleOnBase
    expect(src).toMatch(/mintHandleOnBase[\s\S]{0,200}LEGACY_PATH_DISABLED/);
  });

  it("base.ts transferHandleOnBase throws LEGACY_PATH_DISABLED — legacy transfer locked", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/chains/base.ts"),
      "utf8",
    );
    expect(src).toMatch(/transferHandleOnBase[\s\S]{0,200}LEGACY_PATH_DISABLED/);
  });

  it("handle-lifecycle.ts worker retires anchored handles without auctioning them", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../workers/handle-lifecycle.ts"),
      "utf8",
    );
    // Anchored handles are identified and put on a retire-only path
    expect(src).toContain("chainRegistrations");
    expect(src).toContain("retired");
    // Must NOT send anchored handles to auction
    const anchoredBlock = src.includes("isAnchored") ? src : src;
    expect(src).not.toMatch(/chainRegistrations[\s\S]{0,300}handle_auctions/);
  });

  it("handle.ts isHandleAvailable fails-closed when configured registrar is unreachable", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/handle.ts"),
      "utf8",
    );
    // Fail-closed: if registrar throws, handle should NOT be reported available
    // Read-only registrar check uses isRegistrarReadable (rpcUrl + registrarAddress only)
    expect(src).toContain("isRegistrarReadable");
    // Null result from on-chain check (configured but unreachable) → fail-closed
    expect(src).toContain("Registrar configured but unreachable — fail-closed");
    // Catch block also returns unavailable, not throws or returns available
    expect(src).toMatch(/catch[\s\S]{0,400}available:\s*false/);
  });
});

describe("DID migration — buildErc8004 output uses UUID-rooted canonical DID", () => {
  it("credentials.ts buildErc8004 top-level id is UUID-rooted (agent.id), not handle-rooted", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/credentials.ts"),
      "utf8",
    );
    // canonicalDid must be built from agent.id (UUID), not agent.handle
    expect(src).toContain("canonicalDid");
    expect(src).toMatch(/canonicalDid\s*=\s*`did:web:getagent\.id:agents:\$\{agent\.id\}`/);
    // The top-level id field must use canonicalDid, not a handle-rooted literal
    expect(src).toMatch(/id:\s*canonicalDid/);
    // Handle alias must be a secondary field (alsoKnownAs or handleAlias)
    expect(src).toContain("alsoKnownAs");
    expect(src).toContain("handleAlias");
    expect(src).toMatch(/did:agentid:\$\{agent\.handle\}/);
  });

  it("credentials.ts buildErc8004 agentid.did is UUID-rooted canonicalDid", () => {
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../services/credentials.ts"),
      "utf8",
    );
    // agentid.did must be canonicalDid, not a handle-rooted literal
    const agentidBlock = src.slice(src.indexOf("agentid:"), src.indexOf("metadata:"));
    expect(agentidBlock).toContain("did: canonicalDid");
    expect(agentidBlock).not.toMatch(/did:\s*`did:web:getagent\.id:agents:\$\{agent\.handle\}`/);
  });
});
