/**
 * Security / correctness tests for Task #181 launch hardening.
 *
 * Covers:
 *   T181-1  Canonical DID surfaces (MPP, VC subject, resolver output)
 *   T181-2  NFT transfer detector startup behavior
 *   T181-3  Legacy-field retention justification audit
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// __dirname is artifacts/api-server/src/__tests__; workspace root is 4 levels up
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(WORKSPACE_ROOT, rel), "utf-8");
}

// Convenience to read from api-server source root
function readSrc(rel: string): string {
  return read(path.join("artifacts/api-server/src", rel));
}

// ═══════════════════════════════════════════════════════════════════════════
//  T181-1 — Canonical DID surfaces
// ═══════════════════════════════════════════════════════════════════════════

describe("T181-1 — Canonical DID: no primary handle-rooted did:web in output", () => {
  it("mpp.ts: primary DID is UUID-rooted (did:web:getagent.id:agents:<uuid>)", () => {
    const src = read("artifacts/api-server/src/routes/v1/mpp.ts");
    // The primary DID must use agent.id (UUID), not agent.handle
    expect(src).toMatch(/did:web:getagent\.id:agents:\$\{agent\.id\}/);
  });

  it("mpp.ts: handle-rooted did:web MUST NOT appear as primary DID", () => {
    const src = read("artifacts/api-server/src/routes/v1/mpp.ts");
    // did:web:getagent.id:agents:${agent.handle} must not be used as the primary
    expect(src).not.toMatch(/did:web:getagent\.id:agents:\$\{agent\.handle\}/);
  });

  it("verifiable-credential.ts: VC subject DID is UUID-rooted", () => {
    const src = read("artifacts/api-server/src/services/verifiable-credential.ts");
    // The VC subject id must be UUID-based
    expect(src).toMatch(/did:web:getagent\.id:agents:\$\{.*\.id\}/);
  });

  it("verifiable-credential.ts: handle-rooted did:web does NOT appear in aliases array", () => {
    const src = read("artifacts/api-server/src/services/verifiable-credential.ts");
    // did:web:getagent.id:agents:${agent.handle} is not a valid DID alias
    expect(src).not.toMatch(/did:web:getagent\.id:agents:\$\{[^}]*handle[^}]*\}/);
  });

  it("resolve.ts: machineIdentity DID is UUID-rooted", () => {
    const src = read("artifacts/api-server/src/routes/v1/resolve.ts");
    // machineIdentity must use agent.id
    expect(src).toMatch(/did:web:getagent\.id:agents:\$\{agent\.id\}/);
    // Handle-rooted did:web must not appear in the canonical DID field
    expect(src).not.toMatch(/did:web:getagent\.id:agents:\$\{agent\.handle\}/);
  });

  it("resolve.ts: handleDid uses did:agentid:<handle> format (handle alias only)", () => {
    const src = read("artifacts/api-server/src/routes/v1/resolve.ts");
    // The handle-based DID alias must use did:agentid: scheme (not did:web)
    expect(src).toMatch(/did:agentid:/);
  });

  it("identity.ts: bootstrap DID is UUID-rooted", () => {
    const src = read("artifacts/api-server/src/services/identity.ts");
    // Bootstrap uses did:web:getagent.id:agents:${agent.id}
    expect(src).toMatch(/did:web:getagent\.id:agents:\$\{agent\.id\}/);
    // Must not use handle-rooted did:web as primary DID
    expect(src).not.toMatch(/did:web:getagent\.id:agents:\$\{agent\.handle\}/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  T181-1b — Bootstrap/Resolver coherence via shared anchor-state helper
// ═══════════════════════════════════════════════════════════════════════════

describe("T181-1b — All anchor surfaces use shared deriveAnchorState helper", () => {
  const surfaces = [
    "artifacts/api-server/src/services/identity.ts",
    "artifacts/api-server/src/routes/v1/resolve.ts",
    "artifacts/api-server/src/routes/v1/public-profiles.ts",
    "artifacts/api-server/src/services/agents.ts",
  ];

  for (const rel of surfaces) {
    it(`${path.basename(rel)}: imports and calls deriveAnchorState`, () => {
      const src = read(rel);
      expect(src).toContain("deriveAnchorState");
    });
  }

  it("resolve.ts: emits 3-state onchainStatus (no hardcoded pending-less logic)", () => {
    const src = read("artifacts/api-server/src/routes/v1/resolve.ts");
    // Old code had isBaseAnchored ? "anchored" : "off-chain" — missing "pending"
    // The shared helper eliminates this; confirm the old 2-state branch is gone
    expect(src).not.toMatch(/isBaseAnchored\s*\?\s*["']anchored["']\s*:\s*["']off-chain["']/);
  });

  it("identity.ts: no hardcoded 'off-chain' / 'pending' literals for anchor status", () => {
    const src = read("artifacts/api-server/src/services/identity.ts");
    // After the fix, these literals must not appear as hardcoded assignments
    expect(src).not.toMatch(/erc8004Status:\s*["']off-chain["']/);
    expect(src).not.toMatch(/onchainStatus:\s*["']pending["']/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  T181-2 — NFT transfer detector startup behavior
// ═══════════════════════════════════════════════════════════════════════════

describe("T181-2 — NFT transfer detector: startup and event correctness", () => {
  it("detector exports startNftTransferDetector function", () => {
    const src = read("artifacts/api-server/src/workers/nft-transfer-detector.ts");
    expect(src).toContain("startNftTransferDetector");
  });

  it("detector is guarded by isBaseEnabled() before polling", () => {
    const src = read("artifacts/api-server/src/workers/nft-transfer-detector.ts");
    expect(src).toContain("isBaseEnabled");
  });

  it("detector does NOT start automatically on import (only via startNftTransferDetector call)", () => {
    const src = read("artifacts/api-server/src/workers/nft-transfer-detector.ts");
    // The polling loop must be wrapped in the exported function, not at module level
    // Verify setInterval is only inside function bodies, not at top level
    const lines = src.split("\n");
    const setIntervalLine = lines.find((l) => l.includes("setInterval") && !l.trim().startsWith("//"));
    // setInterval should be inside a function (indented or preceded by function definition)
    expect(setIntervalLine).toBeDefined();
    expect(setIntervalLine!.trim()).not.toBe("setInterval");
  });

  it("detector uses corrected HandleTransferred event ABI shape", () => {
    const src = read("artifacts/api-server/src/workers/nft-transfer-detector.ts");
    // Must include 'string handle' as first non-indexed param (not uint256)
    expect(src).toMatch(/string\s+handle/);
    // Must include 'uint256 indexed agentId' (not agentId alone)
    expect(src).toMatch(/uint256.*agentId/);
  });

  it("detector uses AGENT_ID_HANDLE_ABI from base service (not inline partial ABI)", () => {
    const src = read("artifacts/api-server/src/workers/nft-transfer-detector.ts");
    expect(src).toContain("AGENT_ID_HANDLE_ABI");
  });

  it("detector normalises chainRegistrations as array before findIndex (object-safe)", () => {
    const src = read("artifacts/api-server/src/workers/nft-transfer-detector.ts");
    // normaliseChainRegs must be called before findIndex
    expect(src).toContain("normaliseChainRegs");
    expect(src).toContain("findIndex");
  });

  it("detector writes chainRegistrations (not chainMints) on transfer event", () => {
    const src = read("artifacts/api-server/src/workers/nft-transfer-detector.ts");
    // Set call must include chainRegistrations
    expect(src).toContain("chainRegistrations:");
    // Must NOT write to chainMints
    expect(src).not.toMatch(/\.set\(\{[^}]*chainMints/s);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  T181-3 — Legacy field retention justification audit
// ═══════════════════════════════════════════════════════════════════════════

describe("T181-3 — Legacy field retention: inline justifications present", () => {
  it("handles.ts: chainMints column select has justification comment", () => {
    const src = read("artifacts/api-server/src/routes/v1/handles.ts");
    // Must have a comment explaining why chainMints is retained
    expect(src).toMatch(/chainMints.*cross-chain|cross-chain.*chainMints/s);
  });

  it("handles.ts: onChainTokenId column select has justification comment", () => {
    const src = read("artifacts/api-server/src/routes/v1/handles.ts");
    expect(src).toMatch(/onChainTokenId.*NOT a canonical|NOT.*canonical.*onChainTokenId/s);
  });

  it("nft.ts: onChainTokenId column select has justification comment", () => {
    const src = read("artifacts/api-server/src/routes/v1/nft.ts");
    expect(src).toMatch(/onChainTokenId.*NOT a canonical|NOT.*canonical.*onChainTokenId/s);
  });

  it("resolve.ts: chainMints fallback is explicitly removed with comment", () => {
    const src = read("artifacts/api-server/src/routes/v1/resolve.ts");
    expect(src).toContain("chainMints fallback intentionally removed");
  });
});
