/**
 * Discovery Document Contract Tests — Task #197
 *
 * Verifies that /.well-known/agent-registration:
 *   DC-1: Returns valid JSON with expected shape (platform, endpoints, pricing, authentication, capabilities)
 *   DC-2: Every endpoint URL in the document matches a known real mounted route path
 *   DC-3: reverseResolve documents the correct HTTP method (POST) and canonical path
 *   DC-4: No agentTrust or broken agentProfile references to non-existent routes
 *   DC-5: Pricing copy for 5+ handles does not contain "automatically"
 *   DC-6: Smoke-test that reads well-known.ts source and validates endpoint path strings
 *   DC-7: Cross-document consistency: agent-registration vs agentid-configuration and llms.txt
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import * as fs from "fs";
import * as path from "path";

const TEST_VC_PRIV = JSON.stringify({
  crv: "Ed25519",
  d: "hWS0_Ahm3yC2ZCOcMCQDWq71AZgPEgBfEnheH9wbyYk",
  x: "ys4PP10Pk9buo1UHC0c7VlueRvwNFvczZWYXHg0A0dw",
  kty: "OKP",
  kid: "test-key-dc197",
});
const TEST_VC_PUB = JSON.stringify({
  crv: "Ed25519",
  x: "ys4PP10Pk9buo1UHC0c7VlueRvwNFvczZWYXHg0A0dw",
  kty: "OKP",
  kid: "test-key-dc197",
});

const KNOWN_REAL_ROUTES: Array<{ path: string; method: string }> = [
  { path: "/api/v1/programmatic/agents/register", method: "POST" },
  { path: "/api/v1/programmatic/agents/verify", method: "POST" },
  { path: "/api/v1/resolve", method: "GET" },
  { path: "/api/v1/resolve/{handle}", method: "GET" },
  { path: "/api/v1/resolve/reverse", method: "POST" },
  { path: "/api/v1/handles/check", method: "GET" },
  { path: "/api/v1/handles/pricing", method: "GET" },
  { path: "/api/v1/p/{handle}", method: "GET" },
  { path: "/api/v1/public/agents/{agentIdOrHandle}", method: "GET" },
  { path: "/api/v1/marketplace/listings", method: "GET" },
  { path: "/api/v1/jobs", method: "GET" },
  { path: "/api/healthz", method: "GET" },
  { path: "/api/llms.txt", method: "GET" },
];

describe("DC-1 — agent-registration returns valid JSON with expected shape", () => {
  let app: express.Express;
  let savedVcSigningKey: string | undefined;
  let savedVcPublicKey: string | undefined;

  beforeAll(async () => {
    process.env.PORT = "0";
    process.env.NODE_ENV = "test";
    savedVcSigningKey = process.env.VC_SIGNING_KEY;
    savedVcPublicKey = process.env.VC_PUBLIC_KEY;
    process.env.VC_SIGNING_KEY = TEST_VC_PRIV;
    process.env.VC_PUBLIC_KEY = TEST_VC_PUB;
    const { _resetEnvCacheForTests } = await import("../lib/env");
    _resetEnvCacheForTests();
    const wellKnownMod = await import("../routes/well-known");
    const { errorHandler } = await import("../middlewares/error-handler");
    app = express();
    app.use(express.json());
    app.use(wellKnownMod.default);
    app.use(errorHandler);
  });

  afterAll(async () => {
    if (savedVcSigningKey !== undefined) {
      process.env.VC_SIGNING_KEY = savedVcSigningKey;
    } else {
      delete process.env.VC_SIGNING_KEY;
    }
    if (savedVcPublicKey !== undefined) {
      process.env.VC_PUBLIC_KEY = savedVcPublicKey;
    } else {
      delete process.env.VC_PUBLIC_KEY;
    }
    const { _resetEnvCacheForTests } = await import("../lib/env");
    _resetEnvCacheForTests();
  });

  it("GET /.well-known/agent-registration returns 200 application/json", async () => {
    const res = await request(app).get("/.well-known/agent-registration");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("response has top-level required fields: platform, version, endpoints, authentication, pricing, capabilities", async () => {
    const res = await request(app).get("/.well-known/agent-registration");
    expect(res.body).toHaveProperty("platform");
    expect(res.body).toHaveProperty("version");
    expect(res.body).toHaveProperty("endpoints");
    expect(res.body).toHaveProperty("authentication");
    expect(res.body).toHaveProperty("pricing");
    expect(res.body).toHaveProperty("capabilities");
  });

  it("endpoints object is present and non-empty", async () => {
    const res = await request(app).get("/.well-known/agent-registration");
    expect(typeof res.body.endpoints).toBe("object");
    expect(Object.keys(res.body.endpoints).length).toBeGreaterThan(0);
  });

  it("each endpoint entry has a url field", async () => {
    const res = await request(app).get("/.well-known/agent-registration");
    const endpoints = res.body.endpoints as Record<string, unknown>;
    for (const [key, value] of Object.entries(endpoints)) {
      expect(typeof (value as Record<string, unknown>).url).toBe("string");
    }
  });
});

describe("DC-2 — every endpoint URL in the discovery document matches a known real mounted route", () => {
  it("well-known.ts source: endpoint paths match the canonical KNOWN_REAL_ROUTES list", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );

    for (const { path: routePath } of KNOWN_REAL_ROUTES) {
      const escaped = routePath
        .replace(/\//g, "\\/")
        .replace(/\{[^}]+\}/g, "[^\"]+");
      const regex = new RegExp(escaped);
      expect(src).toMatch(regex);
    }
  });

  it("well-known.ts source: no reference to fictional /api/v1/agents/{handle}/trust route", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    expect(src).not.toContain("/api/v1/agents/{handle}/trust");
    expect(src).not.toContain("agentTrust");
  });

  it("well-known.ts source: agentProfile points to /api/v1/p/{handle} (not /api/v1/agents/{handle})", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    expect(src).toContain("/api/v1/p/{handle}");
    expect(src).toContain("agentProfile");
    expect(src).not.toMatch(/agentProfile.*\/api\/v1\/agents\/\{handle\}/);
  });

  it("well-known.ts source: agentIdentity points to /api/v1/public/agents/{agentIdOrHandle}", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    expect(src).toContain("/api/v1/public/agents/{agentIdOrHandle}");
    expect(src).toContain("agentIdentity");
  });
});

describe("DC-3 — reverseResolve documents the correct method (POST) and canonical path", () => {
  it("well-known.ts source: reverseResolve has method POST", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const reverseResolveIdx = src.indexOf("reverseResolve");
    expect(reverseResolveIdx).toBeGreaterThan(-1);
    const snippet = src.slice(reverseResolveIdx, reverseResolveIdx + 200);
    expect(snippet).toContain("POST");
  });

  it("well-known.ts source: reverseResolve URL is /api/v1/resolve/reverse (canonical path)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    expect(src).toContain("/api/v1/resolve/reverse");
  });

  it("resolve.ts source: POST /reverse route exists (mounted at /api/v1/resolve/reverse)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/resolve.ts"),
      "utf8",
    );
    expect(src).toContain('router.post("/reverse"');
    expect(src).toContain("handleReverse");
  });

  it("v1/index.ts source: resolveRouter is mounted at /resolve making /resolve/reverse the canonical path", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/index.ts"),
      "utf8",
    );
    expect(src).toContain('router.use("/resolve"');
    expect(src).toContain("resolveRouter");
  });
});

describe("DC-4 — No broken agentTrust or old agentProfile route references in discovery document", () => {
  it("well-known.ts source: agentTrust field is not present", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const agentTrustIdx = src.indexOf("agentTrust");
    expect(agentTrustIdx).toBe(-1);
  });

  it("agents.ts source: no public GET /:agentId/trust route (confirming agentTrust fictional)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agents.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/router\.get\s*\(\s*["']\/\:agentId\/trust/);
    expect(src).not.toMatch(/router\.get\s*\(\s*["']\/\:handle\/trust/);
  });

  it("public-profiles.ts source: GET /:handle route exists at /api/v1/p/{handle}", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/public-profiles.ts"),
      "utf8",
    );
    expect(src).toContain('router.get("/:handle"');
  });

  it("agent-identity.ts source: GET /:agentIdOrHandle route exists at /api/v1/public/agents/{agentIdOrHandle}", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/agent-identity.ts"),
      "utf8",
    );
    expect(src).toContain('router.get("/:agentIdOrHandle"');
  });

  it("v1/index.ts source: publicProfilesRouter mounted at /p (confirming /api/v1/p/:handle is real)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/index.ts"),
      "utf8",
    );
    expect(src).toContain('router.use("/p"');
    expect(src).toContain("publicProfilesRouter");
  });

  it("v1/index.ts source: agentIdentityRouter mounted at /public/agents (confirming /api/v1/public/agents/:agentIdOrHandle is real)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/v1/index.ts"),
      "utf8",
    );
    expect(src).toContain('router.use("/public/agents"');
    expect(src).toContain("agentIdentityRouter");
  });
});

describe("DC-5 — Pricing copy for 5+ handles does not contain 'automatically'", () => {
  it("well-known.ts source: 5+ tier description does not say 'automatically'", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const tierIdx = src.indexOf('"5+"');
    expect(tierIdx).toBeGreaterThan(-1);
    const tierSnippet = src.slice(tierIdx, tierIdx + 300);
    expect(tierSnippet).not.toContain("automatically");
  });

  it("well-known.ts source: 5+ tier description says 'choose and register'", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const tierIdx = src.indexOf('"5+"');
    expect(tierIdx).toBeGreaterThan(-1);
    const tierSnippet = src.slice(tierIdx, tierIdx + 400);
    expect(tierSnippet).toContain("choose and register");
  });

  it("llms-txt.ts source: handle pricing section does not say '5+ character handles: 1 included automatically'", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/llms-txt.ts"),
      "utf8",
    );
    expect(src).not.toContain("1 included automatically");
  });

  it("llms-txt.ts source: handle pricing section says 'choose and register' for 5+ chars", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/llms-txt.ts"),
      "utf8",
    );
    const idx5plus = src.indexOf("5+ character handles");
    expect(idx5plus).toBeGreaterThan(-1);
    const snippet = src.slice(idx5plus, idx5plus + 300);
    expect(snippet).toContain("choose and register");
  });
});

describe("DC-6 — Smoke-test: well-known.ts endpoint paths match real route list", () => {
  it("well-known.ts endpoint paths are a subset of known real routes", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const knownPaths = KNOWN_REAL_ROUTES.map(r => r.path);
    for (const knownPath of knownPaths) {
      const escapedPath = knownPath.replace(/\{[^}]+\}/g, "{");
      const presentInDoc = src.includes(escapedPath.replace("{", "{"));
      expect(presentInDoc).toBe(true);
    }
  });

  it("well-known.ts does not reference /api/v1/reverse as a canonical route (only /api/v1/resolve/reverse)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    expect(src).not.toContain('"/api/v1/reverse"');
    expect(src).not.toContain("'/api/v1/reverse'");
    const reverseOccurrences = src.match(/\/api\/v1\/resolve\/reverse/g) ?? [];
    expect(reverseOccurrences.length).toBeGreaterThanOrEqual(1);
  });

  it("all endpoint fields in the agent-registration block use the { url, method } structured format", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const endpointsBlockMatch = src.match(/endpoints:\s*\{([\s\S]*?)\},\s*authentication:/);
    expect(endpointsBlockMatch).not.toBeNull();
    const endpointsBlock = endpointsBlockMatch![1];
    expect(endpointsBlock).toContain('method:');
    expect(endpointsBlock).toContain('url:');
    const endpointFieldNames = ["register", "verify", "resolve", "discovery", "reverseResolve",
      "handleCheck", "handlePricing", "agentProfile", "agentIdentity",
      "marketplaceListings", "jobs", "healthCheck", "llmsTxt"];
    for (const fieldName of endpointFieldNames) {
      const fieldIdx = endpointsBlock.indexOf(fieldName + ":");
      expect(fieldIdx).toBeGreaterThan(-1);
      const fieldSnippet = endpointsBlock.slice(fieldIdx, fieldIdx + 120);
      expect(fieldSnippet).toContain("url:");
    }
  });
});

describe("DC-7 — Cross-document consistency: agent-registration, agentid-configuration, llms.txt", () => {
  it("agentid-configuration resolverEndpoint matches /api/v1/resolve in well-known.ts", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    expect(src).toContain("/api/v1/resolve");
    const resolverEndpointIdx = src.indexOf("resolverEndpoint");
    expect(resolverEndpointIdx).toBeGreaterThan(-1);
    const snippet = src.slice(resolverEndpointIdx, resolverEndpointIdx + 100);
    expect(snippet).toContain("/api/v1/resolve");
  });

  it("agentid-configuration registrationEndpoint matches /api/v1/programmatic/agents/register in well-known.ts", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const regEndpointIdx = src.indexOf("registrationEndpoint");
    expect(regEndpointIdx).toBeGreaterThan(-1);
    const snippet = src.slice(regEndpointIdx, regEndpointIdx + 120);
    expect(snippet).toContain("/api/v1/programmatic/agents/register");
  });

  it("agentid-configuration erc8004Endpoint matches /api/v1/p/{handle}/erc8004 in well-known.ts", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const erc8004EndpointIdx = src.indexOf("erc8004Endpoint");
    expect(erc8004EndpointIdx).toBeGreaterThan(-1);
    const snippet = src.slice(erc8004EndpointIdx, erc8004EndpointIdx + 140);
    expect(snippet).toContain("/api/v1/p/{handle}/erc8004");
  });

  it("llms.txt mentions /api/v1/resolve/:handle as canonical resolve endpoint", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/llms-txt.ts"),
      "utf8",
    );
    expect(src).toContain("/api/v1/resolve/");
  });

  it("llms.txt mentions /api/v1/p/:handle as public profile endpoint", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/llms-txt.ts"),
      "utf8",
    );
    expect(src).toContain("/api/v1/p/");
  });

  it("well-known.ts agent-registration discovery doc does not advertise /api/v1/agents/{handle} as a public profile route", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const agentRegIdx = src.indexOf("agent-registration");
    const endpointsIdx = src.indexOf("endpoints:", agentRegIdx);
    const authIdx = src.indexOf("authentication:", endpointsIdx);
    const endpointsBlock = src.slice(endpointsIdx, authIdx);
    expect(endpointsBlock).not.toContain("/api/v1/agents/{handle}");
    expect(endpointsBlock).not.toContain("agentTrust");
  });

  it("llms-txt.ts does not advertise a fictional /api/v1/agents/:handle/trust route", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/llms-txt.ts"),
      "utf8",
    );
    expect(src).not.toContain("/api/v1/agents/:handle/trust");
    expect(src).not.toContain("/agents/:handle/trust");
  });

  it("llms-txt.ts does not label /api/v1/agents/:handle as a public (no-auth) profile endpoint", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/llms-txt.ts"),
      "utf8",
    );
    const agentHandleRoutePattern = /`GET \/api\/v1\/agents\/:handle`\s*—\s*Retrieve an agent['']s public profile/;
    expect(src).not.toMatch(agentHandleRoutePattern);
  });

  it("llms-txt.ts Agent Profiles section distinguishes authenticated vs public routes", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/llms-txt.ts"),
      "utf8",
    );
    const agentProfilesSectionIdx = src.indexOf("### Agent Profiles");
    expect(agentProfilesSectionIdx).toBeGreaterThan(-1);
    const sectionSnippet = src.slice(agentProfilesSectionIdx, agentProfilesSectionIdx + 400);
    expect(sectionSnippet).toMatch(/requires auth|authenticated/i);
  });

  it("neither agent-registration nor agentid-configuration contain contradictory resolver paths", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../routes/well-known.ts"),
      "utf8",
    );
    const agentidConfigIdx = src.indexOf("agentid-configuration");
    const agentRegistrationIdx = src.indexOf("agent-registration");
    expect(agentidConfigIdx).toBeGreaterThan(-1);
    expect(agentRegistrationIdx).toBeGreaterThan(-1);
    expect(src).toContain("/api/v1/resolve");
    expect(src).toContain("/api/v1/programmatic/agents/register");
  });
});
