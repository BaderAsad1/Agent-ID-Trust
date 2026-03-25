import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";

const TEST_VC_PRIV = JSON.stringify({
  crv: "Ed25519",
  d: "hWS0_Ahm3yC2ZCOcMCQDWq71AZgPEgBfEnheH9wbyYk",
  x: "ys4PP10Pk9buo1UHC0c7VlueRvwNFvczZWYXHg0A0dw",
  kty: "OKP",
  kid: "test-key-oauth-scope",
});
const TEST_VC_PUB = JSON.stringify({
  crv: "Ed25519",
  x: "ys4PP10Pk9buo1UHC0c7VlueRvwNFvczZWYXHg0A0dw",
  kty: "OKP",
  kid: "test-key-oauth-scope",
});

process.env.VC_SIGNING_KEY = TEST_VC_PRIV;
process.env.VC_PUBLIC_KEY = TEST_VC_PUB;

vi.mock("../services/email", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/email.js", () => ({
  sendVerificationCompleteEmail: vi.fn().mockResolvedValue(undefined),
  sendCredentialIssuedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/redis", () => ({
  getRedis: vi.fn().mockReturnValue(null),
  getSharedRedis: vi.fn().mockReturnValue(null),
  isRedisConfigured: vi.fn().mockReturnValue(false),
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
vi.mock("../services/oauth", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    exchangeAuthorizationCode: vi.fn().mockImplementation(async (code: string, clientId: string) => {
      const { db } = await import("@workspace/db");
      const { oauthAuthorizationCodesTable } = await import("@workspace/db/schema");
      const { eq, and, isNull } = await import("drizzle-orm");
      const authCode = await db.query.oauthAuthorizationCodesTable.findFirst({
        where: and(
          eq(oauthAuthorizationCodesTable.code, code),
          eq(oauthAuthorizationCodesTable.clientId, clientId),
          isNull(oauthAuthorizationCodesTable.usedAt),
        ),
      });
      if (!authCode) throw new Error("invalid_grant: Authorization code not found");
      await db.update(oauthAuthorizationCodesTable).set({ usedAt: new Date() }).where(eq(oauthAuthorizationCodesTable.id, authCode.id));
      const scopes = (authCode.scopes as string[]) || [];
      return {
        access_token: `mock.${Buffer.from(JSON.stringify({ scope: scopes.join(" ") })).toString("base64url")}.sig`,
        refresh_token: "mock_refresh_token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: scopes.join(" "),
      };
    }),
  };
});

import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  oauthClientsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createTestUser, createTestAgent } from "../test-support/factories";
import { errorHandler } from "../middlewares/error-handler";
import { createAuthorizationCode } from "../services/oauth";
import crypto from "crypto";
async function buildOAuthApp() {
  const oauthMod = await import("../routes/oauth");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/oauth", oauthMod.default);
  app.use(errorHandler);
  return app;
}

describe("OAuth Scope Regression — allowedScopes enforcement", () => {
  let userId: string;
  let agentId: string;
  let emptyClientId: string;
  let emptyClientDbId: string;
  let specificClientId: string;
  let specificClientDbId: string;
  let emptyAssertionClientId: string;
  let emptyAssertionClientDbId: string;
  let app: express.Express;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const agent = await createTestAgent(userId);
    agentId = agent.id;

    emptyClientId = `test_empty_scope_${Date.now()}`;
    const [emptyClient] = await db.insert(oauthClientsTable).values({
      clientId: emptyClientId,
      name: "Empty Scope Client",
      redirectUris: ["https://example.com/callback"],
      allowedScopes: [],
      grantTypes: ["authorization_code"],
      ownerUserId: userId,
    }).returning();
    emptyClientDbId = emptyClient.id;

    specificClientId = `test_specific_scope_${Date.now()}`;
    const [specificClient] = await db.insert(oauthClientsTable).values({
      clientId: specificClientId,
      name: "Specific Scope Client",
      redirectUris: ["https://example.com/callback"],
      allowedScopes: ["agents:read"],
      grantTypes: ["authorization_code"],
      ownerUserId: userId,
    }).returning();
    specificClientDbId = specificClient.id;

    emptyAssertionClientId = `test_assertion_empty_${Date.now()}`;
    const [assertionClient] = await db.insert(oauthClientsTable).values({
      clientId: emptyAssertionClientId,
      name: "Empty Scope Assertion Client",
      redirectUris: ["https://example.com/callback"],
      allowedScopes: [],
      grantTypes: ["urn:agentid:grant-type:signed-assertion"],
      ownerUserId: userId,
    }).returning();
    emptyAssertionClientDbId = assertionClient.id;

    app = await buildOAuthApp();
  });

  afterAll(async () => {
    await db.delete(oauthClientsTable).where(eq(oauthClientsTable.id, emptyClientDbId)).catch(() => {});
    await db.delete(oauthClientsTable).where(eq(oauthClientsTable.id, specificClientDbId)).catch(() => {});
    await db.delete(oauthClientsTable).where(eq(oauthClientsTable.id, emptyAssertionClientDbId)).catch(() => {});
    await db.delete(agentsTable).where(eq(agentsTable.userId, userId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
  });

  it("client with allowedScopes=[] cannot obtain any scopes (deny-by-default)", async () => {
    const res = await request(app)
      .get("/oauth/authorize")
      .query({
        client_id: emptyClientId,
        response_type: "code",
        scope: "agents:read agents:write",
        redirect_uri: "https://example.com/callback",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
      });

    expect(res.status).toBe(302);
    const redirectUrl = res.headers.location;
    expect(redirectUrl).toBeDefined();
    const url = new URL(redirectUrl);
    const grantedScopes = url.searchParams.get("scopes") || "";
    expect(grantedScopes).toBe("");
  });

  it("client with specific allowedScopes only grants matching scopes (non-matching filtered out)", async () => {
    const res = await request(app)
      .get("/oauth/authorize")
      .query({
        client_id: specificClientId,
        response_type: "code",
        scope: "agents:read agents:write admin:all",
        redirect_uri: "https://example.com/callback",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
      });

    expect(res.status).toBe(302);
    const redirectUrl = res.headers.location;
    const url = new URL(redirectUrl);
    const scopes = url.searchParams.get("scopes");
    expect(scopes).toBe("agents:read");
  });

  it("client with allowedScopes=['agents:read'] rejects scopes not in allowed list", async () => {
    const res = await request(app)
      .get("/oauth/authorize")
      .query({
        client_id: specificClientId,
        response_type: "code",
        scope: "admin:all agents:delete",
        redirect_uri: "https://example.com/callback",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
      });

    expect(res.status).toBe(302);
    const redirectUrl = res.headers.location;
    const url = new URL(redirectUrl);
    const scopes = url.searchParams.get("scopes");
    expect(scopes).toBe("");
  });

  it("token endpoint: unsupported grant type returns 400", async () => {
    const res = await request(app)
      .post("/oauth/token")
      .send({
        grant_type: "client_credentials",
        client_id: emptyClientId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unsupported_grant_type");
  });

  it("token endpoint: authorization_code without code returns 400", async () => {
    const res = await request(app)
      .post("/oauth/token")
      .send({
        grant_type: "authorization_code",
        client_id: emptyClientId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("authorize endpoint: unknown client_id returns 400 invalid_client", async () => {
    const res = await request(app)
      .get("/oauth/authorize")
      .query({
        client_id: "nonexistent_client_id",
        response_type: "code",
        scope: "agents:read",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_client");
  });

  it("authorize endpoint: PKCE is required for public clients (no client secret)", async () => {
    const res = await request(app)
      .get("/oauth/authorize")
      .query({
        client_id: emptyClientId,
        response_type: "code",
        scope: "agents:read",
        redirect_uri: "https://example.com/callback",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("token endpoint (authorization_code): allowedScopes=[] client gets empty scopes on valid exchange", async () => {
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    const code = await createAuthorizationCode(
      emptyClientId,
      agentId,
      "https://example.com/callback",
      [],
      codeChallenge,
      "S256",
    );

    const res = await request(app)
      .post("/oauth/token")
      .send({
        grant_type: "authorization_code",
        code,
        client_id: emptyClientId,
        redirect_uri: "https://example.com/callback",
        code_verifier: codeVerifier,
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("access_token");
    expect(res.body).toHaveProperty("token_type", "Bearer");

    const tokenParts = res.body.access_token.split(".");
    expect(tokenParts.length).toBe(3);
    const payload = JSON.parse(Buffer.from(tokenParts[1], "base64url").toString("utf8"));
    const tokenScopes = payload.scope || payload.scopes || "";
    const scopeArray = typeof tokenScopes === "string" ? tokenScopes.split(" ").filter(Boolean) : tokenScopes;
    expect(scopeArray).toEqual([]);
  });

  it("token endpoint (signed-assertion): allowedScopes=[] returns 400 invalid_scope when scopes requested", async () => {
    const res = await request(app)
      .post("/oauth/token")
      .send({
        grant_type: "urn:agentid:grant-type:signed-assertion",
        client_id: emptyAssertionClientId,
        agent_id: agentId,
        scope: "agents:read agents:write",
        assertion: "dummy_assertion",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_scope");
    expect(res.body.message).toMatch(/scopes.*permitted/i);
  });
});
