/**
 * Launch-Blocker Patch Tests — Task #176
 *
 * Covers four fixes:
 *   T176-1: OAuth/session tokens use did:web:getagent.id:agents:<uuid> as sub
 *   T176-2: /handles/check returns unavailable when registrar reports blocked
 *   T176-3: /handles/check fails closed when registrar is configured but unreachable
 *   T176-4: NFT metadata derives chain anchor from chainRegistrations (not chainMints)
 *   T176-5: BASE_HANDLE_CONTRACT is not an active runtime dependency in base.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import express from "express";
import request from "supertest";

const workspaceRoot = path.join(__dirname, "../../../../");
const apiSrc = path.join(__dirname, "..");

// ══════════════════════════════════════════════════════════════════════════════
// T176-1: OAuth/session outputs use UUID-rooted did:web as sub
// ══════════════════════════════════════════════════════════════════════════════

describe("T176-1 — OAuth/session: sub claim is UUID-rooted did:web (not did:agentid)", () => {
  it("oauth.ts buildAccessTokenPayload uses did:web:getagent.id:agents:<uuid> (not formatDID)", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/oauth.ts"), "utf8");
    expect(src).toContain("did:web:getagent.id:agents:");
    expect(src).not.toMatch(/const did = formatDID/);
  });

  it("oauth.ts does not import formatDID", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/oauth.ts"), "utf8");
    expect(src).not.toMatch(/import.*formatDID.*from/);
  });

  it("oauth.ts buildAccessTokenPayload sets sub from agent.id (UUID), not handle", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/oauth.ts"), "utf8");
    expect(src).toMatch(/buildWebDID\(agent\.id\)/);
  });

  it("oauth.ts buildWebDID produces did:web:getagent.id:agents:<id>", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/oauth.ts"), "utf8");
    expect(src).toMatch(/function buildWebDID/);
    expect(src).toContain("`did:web:getagent.id:agents:${agentId}`");
  });

  it("oauth.ts handle alias is kept only as aliases field when handle exists", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/oauth.ts"), "utf8");
    expect(src).toMatch(/aliases.*did:agentid:/);
  });

  it("oauth.ts introspectOAuthToken uses buildWebDID(agent.id) not formatDID", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/oauth.ts"), "utf8");
    const introspectBlock = src.slice(src.indexOf("export async function introspectOAuthToken"));
    expect(introspectBlock).toMatch(/buildWebDID\(agent\.id\)/);
    expect(introspectBlock).not.toMatch(/formatDID/);
  });

  it("auth-session.ts verifyAndIssueSession uses did:web:getagent.id:agents:<uuid> as sub (not formatDID)", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/auth-session.ts"), "utf8");
    expect(src).toContain("did:web:getagent.id:agents:");
    expect(src).not.toMatch(/const did = formatDID/);
  });

  it("auth-session.ts does not import formatDID", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/auth-session.ts"), "utf8");
    expect(src).not.toMatch(/import.*formatDID.*from/);
  });

  it("auth-session.ts session DID is constructed from agent.id (UUID path)", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/auth-session.ts"), "utf8");
    expect(src).toMatch(/did:web:getagent\.id:agents:\$\{agent\.id\}/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// T176-2: /handles/check returns unavailable when registrar reports blocked
// ══════════════════════════════════════════════════════════════════════════════

describe("T176-2 — /handles/check: returns unavailable when registrar reports blocked", () => {
  it("handles.ts /check route imports isHandleAvailableOnChain from base.ts", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/handles.ts"), "utf8");
    expect(src).toMatch(/import.*isHandleAvailableOnChain.*from.*chains\/base/);
  });

  it("handles.ts /check route calls isHandleAvailableOnChain after local checks", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/handles.ts"), "utf8");
    expect(src).toContain("isHandleAvailableOnChain(normalized)");
  });

  it("handles.ts /check returns available:false and propagates on-chain reason string", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/handles.ts"), "utf8");
    const blockCheck = src.slice(src.indexOf("isRegistrarReadable()"));
    expect(blockCheck).toMatch(/onChainResult\.reason/);
    expect(blockCheck).toMatch(/available: false/);
  });

  it("handles.ts /check guards the registrar call with isRegistrarReadable()", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/handles.ts"), "utf8");
    expect(src).toContain("isRegistrarReadable()");
  });

  it("handles.ts /check behavioral: on-chain check is gated, local checks run first", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/handles.ts"), "utf8");
    const checkRoute = src.slice(src.indexOf('router.get("/check"'), src.indexOf('router.get("/pricing"'));
    const registrarIdx = checkRoute.indexOf("isRegistrarReadable");
    const existingAgentIdx = checkRoute.indexOf("agentsTable.handle");
    expect(registrarIdx).toBeGreaterThan(existingAgentIdx);
  });

  it("base.ts isHandleAvailableOnChain returns { available, reason } object (not bare boolean)", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/chains/base.ts"), "utf8");
    const fnBlock = src.slice(
      src.indexOf("export async function isHandleAvailableOnChain"),
      src.indexOf("export async function transferToUser"),
    );
    expect(fnBlock).toContain("{ available, reason");
    expect(fnBlock).toMatch(/Promise<\{.*available.*reason.*\}.*null>/s);
  });

  it("behavioral: /handles/check returns available:false with registrar reason when on-chain unavailable", async () => {
    const baseMod = await import("../services/chains/base.js");
    vi.spyOn(baseMod, "isRegistrarReadable").mockReturnValue(true);
    vi.spyOn(baseMod, "isHandleAvailableOnChain").mockResolvedValue({
      available: false,
      reason: "handle_registered",
    });

    const routerMod = await import("../routes/v1/handles.js");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/handles", routerMod.default);

    const res = await request(app).get("/api/v1/handles/check?handle=takenhandle99");

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.reason).toBe("handle_registered");

    vi.restoreAllMocks();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// T176-3: /handles/check fails closed when registrar configured but unreachable
// ══════════════════════════════════════════════════════════════════════════════

describe("T176-3 — /handles/check: fails closed when registrar unreachable", () => {
  it("handles.ts /check returns available:false when onChainResult is null (unreachable)", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/handles.ts"), "utf8");
    expect(src).toContain("registrar_unreachable");
    const block = src.slice(src.indexOf("isRegistrarReadable()"));
    expect(block).toMatch(/onChainResult === null/);
    expect(block).toMatch(/available: false/);
  });

  it("base.ts isHandleAvailableOnChain returns null on RPC error (fail-closed signal)", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/chains/base.ts"), "utf8");
    const fnBlock = src.slice(
      src.indexOf("export async function isHandleAvailableOnChain"),
      src.indexOf("export async function transferToUser"),
    );
    expect(fnBlock).toContain("return null");
    expect(fnBlock).toContain("catch");
  });

  it("behavioral: /handles/check returns available:false when registrar is configured but unreachable (null)", async () => {
    const baseMod = await import("../services/chains/base.js");
    vi.spyOn(baseMod, "isRegistrarReadable").mockReturnValue(true);
    vi.spyOn(baseMod, "isHandleAvailableOnChain").mockResolvedValue(null);

    const routerMod = await import("../routes/v1/handles.js");
    const app = express();
    app.use(express.json());
    app.use("/api/v1/handles", routerMod.default);

    const res = await request(app).get("/api/v1/handles/check?handle=somehandle99");

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.reason).toBe("registrar_unreachable");

    vi.restoreAllMocks();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// T176-4: NFT metadata reflects registrar-backed chain state
// ══════════════════════════════════════════════════════════════════════════════

describe("T176-4 — NFT metadata: chain anchor from chainRegistrations (not chainMints)", () => {
  it("nft.ts /metadata/:handle queries chainRegistrations column", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/nft.ts"), "utf8");
    expect(src).toContain("chainRegistrations");
  });

  it("nft.ts /metadata/:handle derives isBaseAnchored from chainRegistrations array", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/nft.ts"), "utf8");
    expect(src).toMatch(/chainRegs\.some/);
    expect(src).toMatch(/\.chain.*startsWith.*base/i);
  });

  it("nft.ts /metadata/:handle does NOT use chainMints as the sole anchor source", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/nft.ts"), "utf8");
    const metadataBlock = src.slice(
      src.indexOf('router.get("/metadata/:handle"'),
      src.indexOf('router.get("/handles/:handle/image.svg"'),
    );
    expect(metadataBlock).not.toMatch(/agent\.chainMints.*===.*true/);
    expect(metadataBlock).not.toMatch(/chainMints.*\["base"\]/);
    expect(metadataBlock).not.toMatch(/agent\.chainMints.*\?\s*\["Base"\]/);
  });

  it("nft.ts /metadata/:handle chains value is derived from registrar-backed state", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/nft.ts"), "utf8");
    const metadataBlock = src.slice(
      src.indexOf('router.get("/metadata/:handle"'),
      src.indexOf('router.get("/handles/:handle/image.svg"'),
    );
    expect(metadataBlock).toContain("isBaseAnchored");
    expect(metadataBlock).toMatch(/chains.*isBaseAnchored.*\["Base"\]/);
  });

  it("nft.ts /metadata/:handle chainRegistrations supercedes chainMints for chain list", () => {
    const src = fs.readFileSync(path.join(apiSrc, "routes/v1/nft.ts"), "utf8");
    const metadataBlock = src.slice(
      src.indexOf('router.get("/metadata/:handle"'),
      src.indexOf('router.get("/handles/:handle/image.svg"'),
    );
    const chainRegsIdx = metadataBlock.indexOf("chainRegistrations");
    const chainMintsIdx = metadataBlock.lastIndexOf("chainMints");
    expect(chainRegsIdx).toBeGreaterThan(-1);
    if (chainMintsIdx > -1) {
      expect(chainRegsIdx).toBeLessThan(chainMintsIdx);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// T176-5: BASE_HANDLE_CONTRACT is not an active launch dependency
// ══════════════════════════════════════════════════════════════════════════════

describe("T176-5 — BASE_HANDLE_CONTRACT: not an active runtime dependency", () => {
  it("base.ts: BASE_HANDLE_CONTRACT is explicitly commented as deprecated", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/chains/base.ts"), "utf8");
    expect(src).toMatch(/BASE_HANDLE_CONTRACT.*deprecated/i);
  });

  it("base.ts: registerOnChain uses registrarAddress (not the legacy contractAddress env value) for the write call", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/chains/base.ts"), "utf8");
    const registerFn = src.slice(
      src.indexOf("export async function registerOnChain"),
      src.indexOf("export async function reserveHandlesOnChain"),
    );
    expect(registerFn).toContain("registrarAddress");
    expect(registerFn).not.toMatch(/address:\s*contractAddress/);
  });

  it("base.ts: contractAddress (from BASE_HANDLE_CONTRACT) is NOT used in transferToUser", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/chains/base.ts"), "utf8");
    const transferFn = src.slice(
      src.indexOf("export async function transferToUser"),
      src.indexOf("export async function resolveOnChain"),
    );
    expect(transferFn).not.toContain("contractAddress");
  });

  it("base.ts: isChainEnabled does NOT require BASE_HANDLE_CONTRACT", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/chains/base.ts"), "utf8");
    const enabledFn = src.slice(
      src.indexOf("function isChainEnabled"),
      src.indexOf("function isChainEnabled") + 300,
    );
    expect(enabledFn).not.toContain("contractAddress");
  });

  it("README.md: BASE_HANDLE_CONTRACT is marked deprecated/migration-only", () => {
    const src = fs.readFileSync(path.join(workspaceRoot, "README.md"), "utf8");
    expect(src).toMatch(/BASE_HANDLE_CONTRACT.*[Dd]eprecated/);
  });

  it("base.ts: live write paths use registrarAddress (BASE_AGENTID_REGISTRAR) not contractAddress", () => {
    const src = fs.readFileSync(path.join(apiSrc, "services/chains/base.ts"), "utf8");
    expect(src).toContain("registrarAddress");
    expect(src).toContain("writeContract");
    expect(src).not.toMatch(/writeContract[\s\S]{0,200}address:\s*contractAddress/);
  });
});
