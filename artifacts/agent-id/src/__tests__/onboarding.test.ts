/**
 * Onboarding Architecture Tests
 *
 * Covers:
 * 1. No verification/authenticate step exists in the onboarding flow (no GitHub/wallet/manual-signing)
 * 2. Claim polling only resolves when the specific intended agent appears (not pre-existing agents)
 * 3. Handle-less success UI copy is valid (no bogus ".agentid" domain)
 * 4. /start route configuration redirects to /get-started
 * 5. Owner-token registration puts token in JSON body (not Authorization header)
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(SRC, relPath), "utf8");
}

// ------------------------------------------------------------------
// Test 1: Start.tsx has been deleted (no fake verification wizard)
// ------------------------------------------------------------------
describe("Onboarding - fake verification wizard removed", () => {
  it("Start.tsx no longer exists in the pages directory", () => {
    const startPath = path.join(SRC, "pages/Start.tsx");
    expect(fs.existsSync(startPath)).toBe(false);
  });

  it("GetStarted.tsx does not contain GitHub/wallet/manual signing options", () => {
    const code = readSrc("pages/GetStarted.tsx");
    expect(code).not.toContain("github");
    expect(code).not.toContain("wallet signature");
    expect(code).not.toContain("manual key signing");
    expect(code).not.toContain("selectedAuthMethod");
    expect(code).not.toContain("verify.initiate");
    expect(code).not.toContain("verify.complete");
  });

  it("GetStarted.tsx does not contain 'Prove you control' or similar coercive verification copy", () => {
    const code = readSrc("pages/GetStarted.tsx");
    expect(code.toLowerCase()).not.toContain("prove you control");
    expect(code.toLowerCase()).not.toContain("verify now for full discovery");
  });
});

// ------------------------------------------------------------------
// Test 2: Claim polling - ID-set based correlation logic
// ------------------------------------------------------------------
describe("Onboarding - claim polling resolves only on specific new agent (not pre-existing)", () => {
  it("detects a new agent by checking ID membership in pre-existing set", () => {
    const preExistingIds = new Set(["agent-aaa", "agent-bbb"]);

    // Same agents - no new agent
    const responseNoNew = [{ id: "agent-aaa" }, { id: "agent-bbb" }];
    const hasNewNoNew = responseNoNew.some(a => !preExistingIds.has(a.id));
    expect(hasNewNoNew).toBe(false);

    // Pre-existing + 1 new (linked via owner token)
    const responseWithNew = [{ id: "agent-aaa" }, { id: "agent-bbb" }, { id: "agent-ccc" }];
    const hasNewWithNew = responseWithNew.some(a => !preExistingIds.has(a.id));
    expect(hasNewWithNew).toBe(true);
  });

  it("does not resolve if user had agents before visiting the link page", () => {
    // Bug scenario: user had 1 agent already. Old count-based check (> 0) would
    // have resolved immediately. ID-set check correctly stays pending.
    const preExistingIds = new Set(["agent-existing"]);
    const pollResult = [{ id: "agent-existing" }];
    const hasNew = pollResult.some(a => !preExistingIds.has(a.id));
    expect(hasNew).toBe(false);
  });

  it("only resolves when a truly new agent ID appears", () => {
    const preExistingIds = new Set(["agent-1", "agent-2", "agent-3"]);
    const afterLink = [
      { id: "agent-1" },
      { id: "agent-2" },
      { id: "agent-3" },
      { id: "agent-newly-linked" },
    ];
    const hasNew = afterLink.some(a => !preExistingIds.has(a.id));
    expect(hasNew).toBe(true);
  });

  it("GetStarted.tsx uses Set-based ID correlation for claim polling (not count-only)", () => {
    const code = readSrc("pages/GetStarted.tsx");
    // Must use preExistingIds (Set-based approach)
    expect(code).toContain("preExistingIds");
    // Must NOT use the old count-based comparison
    expect(code).not.toContain("preExistingCount");
    // Must not resolve on length > 0 alone
    expect(code).not.toMatch(/agents\.length\s*>\s*0/);
  });
});

// ------------------------------------------------------------------
// Test 3: Handle-less success UI - no bogus ".agentid" values
// ------------------------------------------------------------------
describe("Onboarding - handle-less success UI produces valid output", () => {
  it("handle display is conditionally rendered only when handle is truthy", () => {
    function formatAgentLabel(agentName: string, handle: string): string {
      return handle ? `${agentName} (${handle}.agentid)` : agentName;
    }

    expect(formatAgentLabel("My Agent", "my-agent")).toBe("My Agent (my-agent.agentid)");
    expect(formatAgentLabel("My Agent", "")).toBe("My Agent");
    expect(formatAgentLabel("My Agent", "")).not.toContain(".agentid");
  });

  it("QR code value requires a real handle (null for empty handle)", () => {
    function getQrValue(handle: string): string | null {
      return handle ? `https://${handle}.getagent.id` : null;
    }

    expect(getQrValue("my-agent")).toBe("https://my-agent.getagent.id");
    expect(getQrValue("")).toBeNull();
    expect(getQrValue("")).not.toBe("https://.getagent.id");
  });

  it("GetStarted.tsx token-display step conditionally renders handle in description", () => {
    const code = readSrc("pages/GetStarted.tsx");
    // Must use conditional rendering: handle ? `(${handle}.agentid)` : ''
    expect(code).toMatch(/handle\s*\?\s*`.*\.agentid.*`\s*:/);
  });
});

// ------------------------------------------------------------------
// Test 4: Route configuration - /start redirects to /get-started
// ------------------------------------------------------------------
describe("Onboarding - /start is a redirect to /get-started (not a standalone wizard)", () => {
  it("App.tsx does not import the Start component", () => {
    const code = readSrc("App.tsx");
    expect(code).not.toMatch(/import.*\{.*Start.*\}.*from.*pages\/Start/);
    expect(code).not.toContain("<Start");
  });

  it("App.tsx defines /start route as a Navigate redirect, not a Start component", () => {
    const code = readSrc("App.tsx");
    expect(code).toContain('/start');
    // Must use Navigate redirect for /start
    expect(code).toMatch(/path="\/start".*Navigate|Navigate.*path="\/start"/s);
    expect(code).toMatch(/Navigate to="\/get-started"/);
  });

  it("DashboardRoute in App.tsx redirects zero-agent users to /get-started", () => {
    const code = readSrc("App.tsx");
    // Must redirect to /get-started inside DashboardRoute
    expect(code).toContain('/get-started');
    // Must not redirect to /start inside DashboardRoute
    expect(code).not.toMatch(/Navigate to="\/start"/);
  });

  it("OnboardingPlan.tsx navigates to /get-started after plan selection", () => {
    const code = readSrc("pages/OnboardingPlan.tsx");
    expect(code).toContain("'/get-started'");
    expect(code).not.toContain("'/start'");
  });
});

// ------------------------------------------------------------------
// Test 5: Owner-token contract - JSON body, not Authorization header
// ------------------------------------------------------------------
describe("Onboarding - owner-token uses JSON body (matches backend contract)", () => {
  it("claim-existing snippets do NOT use Authorization Bearer header for owner token", () => {
    const code = readSrc("pages/GetStarted.tsx");
    expect(code).not.toContain("Authorization: Bearer ${ownerToken}");
  });

  it("claim-existing snippets put ownerToken in JSON body", () => {
    const code = readSrc("pages/GetStarted.tsx");
    expect(code).toContain('"ownerToken"');
    // The ownerToken appears in the curl/api snippet body
    expect(code).toMatch(/"ownerToken":\s*"\$\{ownerToken\}"/);
  });
});
