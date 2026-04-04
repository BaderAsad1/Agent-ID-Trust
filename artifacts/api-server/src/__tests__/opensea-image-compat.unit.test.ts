/**
 * Unit + route-level tests for OpenSea image_data compatibility (Task #189).
 *
 * Verifies:
 * - buildErc8004() result contains image_data as a base64 data URI
 * - GET /nft/metadata/:handle route response includes image_data
 * - Both derive from the same shared helper (generateHandleCardSvgDataUri)
 * - The base64-decoded value starts with <svg
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { generateHandleCardSvg, generateHandleCardSvgDataUri } from "../lib/handle-card-svg";

vi.mock("@workspace/db", () => ({
  db: {
    query: {
      agentsTable: {
        findFirst: vi.fn(),
      },
      agentKeysTable: {
        findMany: vi.fn(),
      },
      agentDomainsTable: {
        findMany: vi.fn(),
      },
      agentOwsWalletsTable: {
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock("../lib/env", () => ({
  env: () => ({
    API_BASE_URL: "https://getagent.id/api",
    APP_URL: "https://getagent.id",
  }),
}));

vi.mock("../middlewares/request-logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../lib/redis", () => ({
  isRedisConfigured: () => false,
  getSharedRedis: vi.fn(),
}));

vi.mock("../middlewares/rate-limit", () => ({
  publicRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock("../services/chains/base", () => ({
  isOnchainMintingEnabled: vi.fn().mockReturnValue(false),
  transferToUser: vi.fn(),
  BaseChainError: class BaseChainError extends Error {},
}));

vi.mock("../middlewares/replit-auth", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock("../services/agents", () => ({
  agentOwnerFilter: vi.fn().mockReturnValue({}),
  validateHandle: (handle: string) => {
    if (handle.length < 3) return "Handle must be at least 3 characters";
    if (handle.length > 32) return "Handle must be 32 characters or fewer";
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(handle)) {
      return "Handle must contain only lowercase letters, numbers, and hyphens, and must start and end with a letter or number";
    }
    return null;
  },
}));

const MOCK_AGENT = {
  id: "agent-uuid-1",
  handle: "alice",
  displayName: "Alice",
  description: "Test agent",
  isPublic: true,
  status: "active",
  avatarUrl: null,
  endpointUrl: null,
  walletAddress: null,
  paymentAuthorized: false,
  trustScore: 80,
  trustTier: "basic",
  verificationStatus: "verified",
  capabilities: [],
  protocols: [],
  chainRegistrations: [],
  handleTier: "standard",
  handleRegisteredAt: new Date("2025-01-01"),
  nftStatus: "active",
  onChainTokenId: "42",
  createdAt: new Date("2025-01-01"),
};

describe("handle-card-svg shared helper (Task #189)", () => {
  it("generateHandleCardSvg returns a string starting with <svg", () => {
    const svg = generateHandleCardSvg("alice");
    expect(svg.trimStart()).toMatch(/^<svg/);
  });

  it("generateHandleCardSvgDataUri returns a data:image/svg+xml;base64,... URI", () => {
    const uri = generateHandleCardSvgDataUri("alice");
    expect(uri).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("base64-decoded payload from generateHandleCardSvgDataUri starts with <svg", () => {
    const uri = generateHandleCardSvgDataUri("alice");
    const b64 = uri.replace("data:image/svg+xml;base64,", "");
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    expect(decoded.trimStart()).toMatch(/^<svg/);
  });

  it("output is deterministic — same handle produces the same SVG", () => {
    expect(generateHandleCardSvg("testbot")).toBe(generateHandleCardSvg("testbot"));
    expect(generateHandleCardSvgDataUri("testbot")).toBe(generateHandleCardSvgDataUri("testbot"));
  });

  it("different handles produce different SVGs", () => {
    expect(generateHandleCardSvg("alice")).not.toBe(generateHandleCardSvg("bob"));
  });

  it("generateHandleCardSvg embeds the handle text in the SVG", () => {
    const svg = generateHandleCardSvg("myhandle");
    expect(svg).toContain("myhandle");
  });

  it("long handles are truncated in display but SVG is still valid", () => {
    const longHandle = "averylonghandlename123";
    const svg = generateHandleCardSvg(longHandle);
    expect(svg.trimStart()).toMatch(/^<svg/);
    expect(svg).toContain("averylonghandle…");
  });
});

describe("buildErc8004 image_data field (Task #189)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildErc8004 includes image_data derived from the shared helper", async () => {
    const { db } = await import("@workspace/db");

    (db.query.agentsTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
    (db.query.agentKeysTable.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.query.agentDomainsTable.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.query.agentOwsWalletsTable.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { buildErc8004 } = await import("../services/credentials");
    const result = await buildErc8004("alice");

    expect(result).not.toBeNull();
    expect(result!.image_data).toBeDefined();
    expect(result!.image_data).toMatch(/^data:image\/svg\+xml;base64,/);

    const expectedDataUri = generateHandleCardSvgDataUri("alice");
    expect(result!.image_data).toBe(expectedDataUri);
  });

  it("buildErc8004 image_data decodes to SVG starting with <svg", async () => {
    const { db } = await import("@workspace/db");

    (db.query.agentsTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_AGENT,
      id: "agent-uuid-2",
      handle: "testbot",
    });
    (db.query.agentKeysTable.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.query.agentDomainsTable.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.query.agentOwsWalletsTable.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { buildErc8004 } = await import("../services/credentials");
    const result = await buildErc8004("testbot");

    expect(result).not.toBeNull();
    const b64 = result!.image_data!.replace("data:image/svg+xml;base64,", "");
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    expect(decoded.trimStart()).toMatch(/^<svg/);
  });
});

describe("NFT metadata route GET /nft/metadata/:handle — image_data field (Task #189)", () => {
  async function buildNftApp() {
    const app = express();
    app.use(express.json());
    const { default: nftRouter } = await import("../routes/v1/nft");
    app.use("/", nftRouter);
    const { errorHandler } = await import("../middlewares/error-handler");
    app.use(errorHandler);
    return app;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /nft/metadata/:handle returns image_data as a base64 data URI", async () => {
    const { db } = await import("@workspace/db");
    (db.query.agentsTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

    const app = await buildNftApp();
    const res = await request(app).get("/nft/metadata/alice");

    expect(res.status).toBe(200);
    expect(res.body.image_data).toBeDefined();
    expect(res.body.image_data).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("GET /nft/metadata/:handle image_data decodes to SVG starting with <svg", async () => {
    const { db } = await import("@workspace/db");
    (db.query.agentsTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

    const app = await buildNftApp();
    const res = await request(app).get("/nft/metadata/alice");

    expect(res.status).toBe(200);
    const b64 = res.body.image_data.replace("data:image/svg+xml;base64,", "");
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    expect(decoded.trimStart()).toMatch(/^<svg/);
  });

  it("GET /nft/metadata/:handle image_data matches generateHandleCardSvgDataUri output — same shared helper", async () => {
    const { db } = await import("@workspace/db");
    (db.query.agentsTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

    const app = await buildNftApp();
    const res = await request(app).get("/nft/metadata/alice");

    expect(res.status).toBe(200);
    const expectedImageData = generateHandleCardSvgDataUri("alice");
    expect(res.body.image_data).toBe(expectedImageData);
  });

  it("buildErc8004 and GET /nft/metadata/:handle produce the same image_data for the same handle", async () => {
    const { db } = await import("@workspace/db");

    (db.query.agentsTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
    (db.query.agentKeysTable.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.query.agentDomainsTable.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.query.agentOwsWalletsTable.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { buildErc8004 } = await import("../services/credentials");
    const erc8004Result = await buildErc8004("alice");

    (db.query.agentsTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);
    const app = await buildNftApp();
    const res = await request(app).get("/nft/metadata/alice");

    expect(erc8004Result).not.toBeNull();
    expect(res.status).toBe(200);
    expect(erc8004Result!.image_data).toBe(res.body.image_data);
  });

  it("GET /nft/metadata/:handle still returns image URL alongside image_data", async () => {
    const { db } = await import("@workspace/db");
    (db.query.agentsTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

    const app = await buildNftApp();
    const res = await request(app).get("/nft/metadata/alice");

    expect(res.status).toBe(200);
    expect(res.body.image).toMatch(/image\.svg$/);
    expect(res.body.image_data).toBeDefined();
  });

  it("GET /nft/metadata/:handle returns handle-centric metadata even when no agent is linked", async () => {
    const { db } = await import("@workspace/db");
    (db.query.agentsTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const app = await buildNftApp();
    const res = await request(app).get("/nft/metadata/launchsmoke20260403");

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("launchsmoke20260403.agentid");
    expect(res.body.description).toContain("represents the handle itself");
    expect(res.body.image).toBe("https://getagent.id/api/v1/handles/launchsmoke20260403/image.svg");
    expect(res.body.external_url).toBe("https://getagent.id/launchsmoke20260403");
    expect(res.body.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trait_type: "Namespace", value: ".agentid" }),
        expect.objectContaining({ trait_type: "Registration State", value: "unreconciled" }),
        expect.objectContaining({ trait_type: "On-chain Status", value: "Off-chain" }),
        expect.objectContaining({ trait_type: "Custody", value: "unassigned" }),
      ]),
    );
  });
});

describe("Legacy agent-card route", () => {
  async function buildAgentCardApp() {
    const app = express();
    const { default: agentCardRouter } = await import("../routes/v1/agent-card");
    app.use("/", agentCardRouter);
    return app;
  }

  it("redirects legacy /agent-card/:handle requests to the canonical handle NFT metadata route", async () => {
    const app = await buildAgentCardApp();
    const res = await request(app).get("/launchsmoke20260403");

    expect(res.status).toBe(308);
    expect(res.headers.location).toBe("https://getagent.id/api/v1/nft/metadata/launchsmoke20260403");
  });
});
