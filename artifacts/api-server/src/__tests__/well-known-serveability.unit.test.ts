import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const mockAgentFindFirst = vi.fn();
const mockDomainFindFirst = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    query: {
      agentsTable: {
        findFirst: (...args: unknown[]) => mockAgentFindFirst(...args),
      },
      agentDomainsTable: {
        findFirst: (...args: unknown[]) => mockDomainFindFirst(...args),
      },
      agentKeysTable: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("@workspace/db/schema", () => ({
  agentsTable: {
    id: "id",
    handle: "handle",
    isPublic: "is_public",
    status: "status",
  },
  agentKeysTable: {
    agentId: "agent_id",
    status: "status",
  },
  agentDomainsTable: {
    domain: "domain",
    agentId: "agent_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ op: "eq", a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
}));

vi.mock("../lib/env", () => ({
  env: () => ({
    BASE_AGENT_DOMAIN: "getagent.id",
    APP_URL: "https://getagent.id",
  }),
}));

vi.mock("../routes/v1/agent-card", () => ({
  handleDomainVerification: (_req: express.Request, res: express.Response) => {
    res.json({ ok: true });
  },
}));

async function buildApp() {
  const app = express();
  app.use(express.json());
  const { default: wellKnownRouter } = await import("../routes/well-known");
  const { errorHandler } = await import("../middlewares/error-handler");
  app.use(wellKnownRouter);
  app.use(errorHandler);
  return app;
}

describe("well-known agent identity serveability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDomainFindFirst.mockResolvedValue(null);
  });

  it("returns 404 for an inactive agent handle instead of serving a machine identity document", async () => {
    mockAgentFindFirst.mockResolvedValueOnce({
      id: "agent-1",
      handle: "alice",
      isPublic: true,
      status: "inactive",
      handleStatus: "active",
    });

    const app = await buildApp();
    const res = await request(app).get("/.well-known/agent.json?handle=alice");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AGENT_NOT_FOUND");
  });

  it("returns 404 for a retired handle instead of serving a machine identity document", async () => {
    mockAgentFindFirst.mockResolvedValueOnce({
      id: "agent-1",
      handle: "alice",
      isPublic: true,
      status: "active",
      handleStatus: "retired",
    });

    const app = await buildApp();
    const res = await request(app).get("/.well-known/agent.json?handle=alice");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AGENT_NOT_FOUND");
  });
});
