/**
 * Registrar Truthfulness Tests — Task #173
 *
 * Verifies:
 *   T173-1: well-known @context and @type use AgentID branding
 *   T173-2: buildErc8004 image URL points to SVG handle route (not UUID nft-image route)
 *   T173-3: prompt-block header uses "## AgentID" (not "## Agent Identity — Agent ID")
 *   T173-4: No did:agentid:* as primary DID in public/SDK outputs
 *   T173-5: No chainMints as primary source in agent-card.ts
 *   T173-6: deployment.json base-sepolia implementation address is correct
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const workspaceRoot = path.join(__dirname, "../../../../");

describe("T173-1 — well-known @context and @type: AgentID branding", () => {
  it("well-known.ts buildAgentIdentityDocument uses @context 'https://getagent.id/ns/agentid/v1'", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    expect(src).toContain("https://getagent.id/ns/agentid/v1");
    expect(src).not.toContain("https://getagent.id/ns/agent-identity/v1");
  });

  it("well-known.ts buildAgentIdentityDocument uses @type 'AgentID'", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    expect(src).toMatch(/"@type":\s*"AgentID"/);
    expect(src).not.toMatch(/"@type":\s*"AgentIdentity"/);
  });
});

describe("T173-2 — buildErc8004 image URL points to SVG handle route", () => {
  it("credentials.ts buildErc8004 image fallback uses /api/v1/handles/<handle>/image.svg", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/credentials.ts"),
      "utf8",
    );
    expect(src).toContain("/api/v1/handles/${agent.handle}/image.svg");
    expect(src).not.toContain("/api/v1/agents/${agent.id}/nft-image");
  });

  it("credentials.ts buildErc8004 image has defensive null guard when handle is missing", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/credentials.ts"),
      "utf8",
    );
    expect(src).toMatch(/agent\.avatarUrl\s*\|\|\s*\(agent\.handle\s*\?/);
  });

  it("nft.ts SVG route /handles/:handle/image.svg exists", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/nft.ts"),
      "utf8",
    );
    expect(src).toContain("/handles/:handle/image.svg");
  });
});

describe("T173-3 — prompt-block header branding and canonical DID (behavioral)", () => {
  it("prompt-block.ts header uses '## AgentID' (not '## Agent Identity — Agent ID')", () => {
    const src = fs.readFileSync(
      path.join(workspaceRoot, "lib/sdk/src/utils/prompt-block.ts"),
      "utf8",
    );
    expect(src).toContain("## AgentID");
    expect(src).not.toContain("## Agent Identity — Agent ID");
  });

  it("prompt-block.ts DID line uses UUID-rooted did:web (not did:agentid: as primary)", () => {
    const src = fs.readFileSync(
      path.join(workspaceRoot, "lib/sdk/src/utils/prompt-block.ts"),
      "utf8",
    );
    expect(src).toContain("did:web:getagent.id:agents:${agentId}");
    expect(src).not.toMatch(/\*\*DID\*\*.*did:agentid:/);
  });

  it("formatPromptBlock runtime: DID field uses canonical did:web UUID form, handle DID is alias only", async () => {
    const { formatPromptBlock } = await import("../../../../lib/sdk/src/utils/prompt-block.js");
    const output = formatPromptBlock({
      agent_id: "uuid-test-1234-5678",
      handle: "mybot",
      display_name: "My Bot",
      trust: { score: 80, tier: "verified" },
      capabilities: [],
    } as Parameters<typeof formatPromptBlock>[0]);
    expect(output).toContain("did:web:getagent.id:agents:uuid-test-1234-5678");
    expect(output).toMatch(/\*\*DID\*\*: did:web:getagent\.id:agents:uuid-test-1234-5678/);
    expect(output).not.toMatch(/\*\*DID\*\*: did:agentid:/);
    expect(output).toContain("## AgentID");
  });

  it("formatPromptBlock runtime: handle DID alias is present in alias field only, not as primary DID", async () => {
    const { formatPromptBlock } = await import("../../../../lib/sdk/src/utils/prompt-block.js");
    const output = formatPromptBlock({
      agent_id: "uuid-test-1234-5678",
      handle: "mybot",
      display_name: "My Bot",
      trust: { score: 80, tier: "verified" },
      capabilities: [],
    } as Parameters<typeof formatPromptBlock>[0]);
    expect(output).toContain("did:agentid:mybot");
    expect(output).toMatch(/alias.*did:agentid:|did:agentid:.*alias/i);
    const didLine = output.split("\n").find(l => l.includes("**DID**:"));
    expect(didLine).toBeDefined();
    expect(didLine).not.toContain("did:agentid:");
  });

  it("agents.ts identity-file route uses '## AgentID' in promptBlock", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agents.ts"),
      "utf8",
    );
    const occurrences = (src.match(/## AgentID/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
    expect(src).not.toContain("## Agent Identity — Agent ID");
  });

  it("agents.ts openclaw format uses '# AgentID' (not '# Agent Identity')", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agents.ts"),
      "utf8",
    );
    expect(src).toContain("# AgentID");
    expect(src).not.toContain("# Agent Identity");
  });
});

describe("T173-4 — No did:agentid:* as primary DID on public/SDK machine-facing surfaces", () => {
  it("resolve.ts top-level did field uses UUID-rooted did:web (not did:agentid:)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    const uuidDidMatches = (src.match(/did:\s*`did:web:getagent\.id:agents:\$\{agent\.id\}`/g) ?? []).length;
    expect(uuidDidMatches).toBeGreaterThanOrEqual(2);
  });

  it("resolve.ts handleAlias is the only did:agentid: usage (not a top-level did field)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    const agentidMatches = (src.match(/did:agentid:/g) ?? []).length;
    expect(agentidMatches).toBe(1);
    expect(src).toContain("handleAlias:");
    const handleAliasPos = src.indexOf("handleAlias:");
    const agentidPos = src.indexOf("did:agentid:");
    expect(Math.abs(handleAliasPos - agentidPos)).toBeLessThan(100);
  });

  it("credentials.ts buildErc8004 primary id uses canonicalDid (UUID-rooted)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/credentials.ts"),
      "utf8",
    );
    expect(src).toMatch(/id:\s*canonicalDid/);
    expect(src).not.toMatch(/id:\s*`did:agentid:/);
  });

  it("agent-card.ts did field uses UUID-rooted did:web (not did:agentid:)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agent-card.ts"),
      "utf8",
    );
    expect(src).toMatch(/did:\s*`did:web:getagent\.id:agents:\$\{a\.id\}`/);
    expect(src).not.toMatch(/did:\s*`did:agentid:/);
  });
});

describe("T173-5 — chainRegistrations is canonical source (not chainMints) in agent-card and ERC-8004", () => {
  it("agent-card.ts uses chainRegistrations and does not use chainMints for anchor output", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agent-card.ts"),
      "utf8",
    );
    expect(src).toContain("chainRegistrations");
    expect(src).not.toMatch(/\bchainMints\b/);
  });

  it("resolve.ts uses chainRegistrations (canonical) and has removed chainMints fallback", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    expect(src).toContain("chainRegistrations");
    expect(src).toContain("chainMints fallback intentionally removed");
  });

  it("credentials.ts parseChainRegistrations does not fall back to chainMints (legacy) when chainRegistrations is missing", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/credentials.ts"),
      "utf8",
    );
    const funcStart = src.indexOf("function parseChainRegistrations");
    const funcEnd = src.indexOf("}", funcStart) + 1;
    const funcBody = src.slice(funcStart, funcEnd);
    expect(funcBody).not.toContain("chainMints");
    expect(funcBody).not.toMatch(/Object\.entries\s*\(chainMints\)/);
  });

  it("credentials.ts buildErc8004 parseChainRegistrations call does not pass chainMints as fallback", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/credentials.ts"),
      "utf8",
    );
    const callMatch = src.match(/parseChainRegistrations\s*\([^)]+\)/);
    expect(callMatch).toBeTruthy();
    expect(callMatch![0]).not.toContain("chainMints");
  });

  it("credentials.ts buildErc8004 registrations output is sourced from chainRegistrations only", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/credentials.ts"),
      "utf8",
    );
    expect(src).toContain("chainRegistrations");
    expect(src).toContain("parseChainRegistrations");
    const parseChainCallCount = (src.match(/parseChainRegistrations\s*\(/g) ?? []).length;
    expect(parseChainCallCount).toBeGreaterThanOrEqual(1);
  });
});

describe("T173-6 — deployment.json base-sepolia implementation address", () => {
  it("base-sepolia implementation is set to 0xDcB100777D97e57c6f7080cB6Bcc0CA5D1d12976", () => {
    const raw = fs.readFileSync(
      path.join(workspaceRoot, "contracts/deployment.json"),
      "utf8",
    );
    const manifest = JSON.parse(raw);
    expect(manifest["base-sepolia"].implementation).toBe("0xDcB100777D97e57c6f7080cB6Bcc0CA5D1d12976");
  });

  it("base-sepolia proxy address remains unchanged at 0x1D592A07dF4aFd897D25d348e90389C494034110", () => {
    const raw = fs.readFileSync(
      path.join(workspaceRoot, "contracts/deployment.json"),
      "utf8",
    );
    const manifest = JSON.parse(raw);
    expect(manifest["base-sepolia"].proxy).toBe("0x1D592A07dF4aFd897D25d348e90389C494034110");
  });

  it("base-sepolia erc8004Registry address remains unchanged at 0x8004A818BFB912233c491871b3d84c89A494BD9e", () => {
    const raw = fs.readFileSync(
      path.join(workspaceRoot, "contracts/deployment.json"),
      "utf8",
    );
    const manifest = JSON.parse(raw);
    expect(manifest["base-sepolia"].erc8004Registry).toBe("0x8004A818BFB912233c491871b3d84c89A494BD9e");
  });
});
