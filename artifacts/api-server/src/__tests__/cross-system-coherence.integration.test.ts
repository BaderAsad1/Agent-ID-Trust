import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../services/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
  sendAgentRegisteredEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email.js", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
  sendAgentRegisteredEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/credentials", () => ({
  reissueCredential: vi.fn().mockResolvedValue(undefined),
  issueCredential: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/verifiable-credential", () => ({
  clearVcCache: vi.fn(),
}));
vi.mock("../lib/resolution-cache", () => ({
  getResolutionCache: vi.fn().mockResolvedValue(null),
  setResolutionCache: vi.fn().mockResolvedValue(undefined),
  deleteResolutionCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/billing", () => ({
  getUserPlan: vi.fn().mockResolvedValue("free"),
  getPlanLimits: vi.fn().mockReturnValue({ maxAgents: 5, canReceiveMail: false }),
  getActiveUserSubscription: vi.fn().mockResolvedValue(null),
}));
vi.mock("../services/mail", () => ({
  provisionInboxForAgent: vi.fn().mockResolvedValue(undefined),
  getOrCreateInbox: vi.fn().mockResolvedValue(null),
}));

import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  agentKeysTable,
  auditEventsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createTestUser,
  createTestAgent,
  createTestAgentKey,
} from "../test-support/factories";
import { revokeAgentKey } from "../services/agent-keys";
import { deleteResolutionCache } from "../lib/resolution-cache";
import { reissueCredential } from "../services/credentials";
import { clearVcCache } from "../services/verifiable-credential";
import { isHandleReserved, RESERVED_HANDLES } from "../services/agents";
import { isHandleReserved as isHandleReservedHandle, RESERVED_HANDLES as RESERVED_HANDLES_HANDLE } from "../services/handle";
import request from "supertest";
import express from "express";
import { errorHandler } from "../middlewares/error-handler";

const ADMIN_KEY = "test-coherence-admin-key-9z1b";

async function buildApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { default: adminRouter } = await import("../routes/v1/admin");
  const { default: resolveRouter } = await import("../routes/v1/resolve");
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/resolve", resolveRouter);
  app.use(errorHandler);
  return app;
}

describe("Cross-System Coherence — Admin Revocation Propagation", () => {
  let app: express.Express;
  let userId: string;
  let agentId: string;
  let keyId: string;

  beforeAll(async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_KEY;
    app = await buildApp();
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, { isPublic: true, handlePaid: true });
    agentId = agent.id;
    const key = await createTestAgentKey(agentId);
    keyId = key.id;
  });

  afterAll(async () => {
    delete process.env.ADMIN_SECRET_KEY;
    await db.delete(auditEventsTable).where(eq(auditEventsTable.targetId, agentId)).catch(() => {});
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("admin revocation cascades to keys, credentials, VC cache, and resolution cache", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/agents/${agentId}/revoke`)
      .set("X-Admin-Key", ADMIN_KEY)
      .send({ reason: "coherence_test", statement: "Cross-system coherence test" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dbKey = await db.query.agentKeysTable.findFirst({
      where: and(eq(agentKeysTable.id, keyId), eq(agentKeysTable.agentId, agentId)),
      columns: { status: true, revokedAt: true },
    });
    expect(dbKey).toBeDefined();
    expect(dbKey!.status).toBe("revoked");
    expect(dbKey!.revokedAt).toBeInstanceOf(Date);

    expect(deleteResolutionCache).toHaveBeenCalled();
    expect(clearVcCache).toHaveBeenCalledWith(agentId);
  });

  it("revoked agent returns 410 from resolver", async () => {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { handle: true },
    });

    const res = await request(app)
      .get(`/api/v1/resolve/${agent!.handle}`)
      .set("User-Agent", "curl/7.88.1")
      .set("Accept", "application/json");

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("AGENT_REVOKED");
  });
});

describe("Cross-System Coherence — Key Revocation Propagation", () => {
  let userId: string;
  let agentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId, { isPublic: true });
    agentId = agent.id;
  });

  afterAll(async () => {
    await db.delete(agentKeysTable).where(eq(agentKeysTable.agentId, agentId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("revoking an agent key triggers credential reissue, VC cache clear, and resolution cache invalidation", async () => {
    const key = await createTestAgentKey(agentId);

    vi.mocked(reissueCredential).mockClear();
    vi.mocked(clearVcCache).mockClear();
    vi.mocked(deleteResolutionCache).mockClear();

    const result = await revokeAgentKey(agentId, key.id);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("revoked");

    expect(reissueCredential).toHaveBeenCalledWith(agentId);
    expect(clearVcCache).toHaveBeenCalledWith(agentId);
    expect(deleteResolutionCache).toHaveBeenCalled();
  });
});

describe("Cross-System Coherence — Concept Drift: RESERVED_HANDLES consistency", () => {
  it("agents.ts and handle.ts export the same RESERVED_HANDLES set", () => {
    expect(RESERVED_HANDLES).toBe(RESERVED_HANDLES_HANDLE);
  });

  it("isHandleReserved from agents.ts and handle.ts are the same function", () => {
    expect(isHandleReserved).toBe(isHandleReservedHandle);
  });

  it("all canonical reserved handles are blocked", () => {
    const criticalReserved = [
      "admin", "root", "system", "openai", "anthropic", "google",
      "agentid", "gpt", "claude", "gemini", "support", "api",
    ];
    for (const h of criticalReserved) {
      expect(isHandleReserved(h)).toBe(true);
    }
  });
});

describe("Cross-System Coherence — MCP Trust Tier Alignment", () => {
  it("MCP trust tiers match DB tier names", async () => {
    const mcpTools = await import("../../../../mcp-server/src/tools/index");
    const validDbTiers = ["unverified", "basic", "verified", "trusted", "elite"];
    const discoverSchema = (mcpTools as any).TRUST_TIER_TO_MIN_SCORE;
    if (discoverSchema) {
      const mcpTiers = Object.keys(discoverSchema);
      for (const tier of mcpTiers) {
        expect(validDbTiers).toContain(tier);
      }
    }
  });
});
