import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentKeysTable, agentDomainsTable } from "@workspace/db/schema";
import { normalizeHandle, formatHandle, formatDomain, formatDID, formatProfileUrl, formatResolverUrl } from "../utils/handle";

const router = Router();

import { env } from "../lib/env";

const BASE_DOMAIN = env().BASE_AGENT_DOMAIN;
const APP_URL = env().APP_URL;

async function getAgentBySubdomain(hostname: string) {
  const domainRecord = await db.query.agentDomainsTable.findFirst({
    where: eq(agentDomainsTable.domain, hostname.toLowerCase()),
  });
  if (!domainRecord) return null;

  const agent = await db.query.agentsTable.findFirst({
    where: and(
      eq(agentsTable.id, domainRecord.agentId),
      eq(agentsTable.status, "active"),
      eq(agentsTable.isPublic, true),
    ),
  });
  return agent || null;
}

async function getAgentByHandle(handle: string) {
  return db.query.agentsTable.findFirst({
    where: and(
      eq(agentsTable.handle, handle),
      eq(agentsTable.isPublic, true),
    ),
  });
}

async function getOwnerKey(agentId: string) {
  const key = await db.query.agentKeysTable.findFirst({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.status, "active"),
    ),
    columns: { kid: true, publicKey: true, keyType: true },
  });
  return key || null;
}

function buildAgentIdentityDocument(
  agent: typeof agentsTable.$inferSelect,
  ownerKey: { kid: string; publicKey: string | null; keyType: string } | null,
) {
  const handle = normalizeHandle(agent.handle ?? "");
  return {
    "@context": "https://getagent.id/ns/agent-identity/v1",
    "@type": "AgentIdentity",
    id: formatDID(handle),
    handle: agent.handle,
    protocolAddress: formatHandle(handle),
    domain: formatDomain(handle),
    displayName: agent.displayName,
    description: agent.description,
    endpointUrl: agent.endpointUrl,
    capabilities: agent.capabilities || [],
    protocols: agent.protocols || [],
    authMethods: agent.authMethods || [],
    trustScore: agent.trustScore,
    trustTier: agent.trustTier,
    verificationStatus: agent.verificationStatus,
    verifiedAt: agent.verifiedAt,
    ownerKey: ownerKey ? {
      kid: ownerKey.kid,
      algorithm: ownerKey.keyType,
      publicKey: ownerKey.publicKey,
    } : null,
    links: {
      self: `https://${formatDomain(handle)}/.well-known/agent.json`,
      profile: formatProfileUrl(handle),
      resolve: formatResolverUrl(handle),
    },
    revocation: agent.status === "revoked" ? {
      revokedAt: agent.revokedAt,
      reason: agent.revocationReason,
      statement: agent.revocationStatement,
    } : null,
    metadata: agent.metadata,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

router.get("/.well-known/agent.json", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hostname = req.hostname || req.headers.host?.split(":")[0] || "";

    let agent: typeof agentsTable.$inferSelect | null | undefined = null;

    if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
      const subdomain = hostname.replace(`.${BASE_DOMAIN}`, "");
      agent = await getAgentByHandle(subdomain);
    }

    if (!agent) {
      agent = await getAgentBySubdomain(hostname);
    }

    const handleParam = req.query.handle as string | undefined;
    if (!agent && handleParam) {
      agent = await getAgentByHandle(normalizeHandle(handleParam));
    }

    if (!agent) {
      const requestId = (req as unknown as { requestId?: string }).requestId || req.headers["x-request-id"] || "unknown";
      res.status(404).json({
        error: "AGENT_NOT_FOUND",
        message: "No agent identity found for this domain. Resolve agents via GET /api/v1/resolve/:handle",
        requestId,
      });
      return;
    }

    if (agent.status === "revoked") {
      const revokedHandle = normalizeHandle(agent.handle ?? "");
      res.status(410).json({
        error: "AGENT_REVOKED",
        message: "This agent identity has been revoked.",
        revocation: {
          revokedAt: agent.revokedAt,
          reason: agent.revocationReason,
          statement: agent.revocationStatement,
          did: `did:agentid:${revokedHandle}`,
        },
      });
      return;
    }

    const ownerKey = await getOwnerKey(agent.id);
    const doc = buildAgentIdentityDocument(agent, ownerKey);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

router.get("/.well-known/agentid-configuration", async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    protocol: "agentid/v1",
    namespace: ".agentid",
    resolverEndpoint: `${APP_URL}/api/v1/resolve`,
    registrationEndpoint: `${APP_URL}/api/v1/programmatic/agents/register`,
    verificationEndpoint: `${APP_URL}/api/v1/programmatic/agents/verify`,
    humanRegistrationEndpoint: `${APP_URL}/start`,
    credentialEndpoint: `${APP_URL}/api/.well-known/agent.json`,
    resolutionEndpoint: `${APP_URL}/api/v1/resolve`,
    erc8004Endpoint: `${APP_URL}/api/v1/resolve`,
    wellKnownPath: "/.well-known/agent.json",
    baseDomain: BASE_DOMAIN,
    documentation: "https://docs.getagent.id",
    sdkPackage: "@agentid/resolver",
    llmsTxt: `${APP_URL}/api/llms.txt`,
    agentGuide: `${APP_URL}/api/agent`,
    agentRegistration: `${APP_URL}/api/.well-known/agent-registration`,
  });
});

router.get("/.well-known/jwks.json", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { getJwks } = await import("../services/verifiable-credential");
    const jwks = await getJwks();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(jwks);
  } catch (err) {
    next(err);
  }
});

router.get("/.well-known/openid-configuration", async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    issuer: APP_URL || "https://getagent.id",
    authorization_endpoint: `${APP_URL}/oauth/authorize`,
    token_endpoint: `${APP_URL}/oauth/token`,
    revocation_endpoint: `${APP_URL}/oauth/revoke`,
    introspection_endpoint: `${APP_URL}/api/v1/auth/introspect`,
    jwks_uri: `${APP_URL}/.well-known/jwks.json`,
    registration_endpoint: `${APP_URL}/api/v1/clients`,
    scopes_supported: ["read", "write", "agents:read", "agents:write", "tasks:read", "tasks:write", "mail:read", "mail:write"],
    response_types_supported: ["code"],
    grant_types_supported: [
      "authorization_code",
      "urn:agentid:grant-type:signed-assertion",
    ],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    code_challenge_methods_supported: ["S256", "plain"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["EdDSA"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "jti",
      "agent_id",
      "trust_tier",
      "verification_status",
      "owner_type",
      "scope",
      "trust_context",
    ],
  });
});

router.get("/.well-known/agent-registration", async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    platform: "Agent ID",
    version: "1.0",
    description: "The identity and trust layer for autonomous AI agents",
    namespace: ".agentid",
    baseDomain: BASE_DOMAIN,
    endpoints: {
      register: `${APP_URL}/api/v1/programmatic/agents/register`,
      verify: `${APP_URL}/api/v1/programmatic/agents/verify`,
      resolve: `${APP_URL}/api/v1/resolve/{handle}`,
      discovery: `${APP_URL}/api/v1/resolve`,
      reverseResolve: `${APP_URL}/api/v1/resolve/reverse`,
      handleCheck: `${APP_URL}/api/v1/handles/check`,
      handlePricing: `${APP_URL}/api/v1/handles/pricing`,
      agentProfile: `${APP_URL}/api/v1/agents/{handle}`,
      agentTrust: `${APP_URL}/api/v1/agents/{handle}/trust`,
      marketplaceListings: `${APP_URL}/api/v1/marketplace/listings`,
      jobs: `${APP_URL}/api/v1/jobs`,
      healthCheck: `${APP_URL}/api/healthz`,
      llmsTxt: `${APP_URL}/api/llms.txt`,
    },
    authentication: {
      agentRegistration: "none",
      agentVerification: "Ed25519 key-signing",
      apiAccess: "Bearer token or X-Agent-Key header",
      humanAccess: "OpenID Connect (Replit Auth)",
    },
    handleRules: {
      minLength: 3,
      maxLength: 64,
      allowedCharacters: "a-z, 0-9, hyphens",
      format: "lowercase alphanumeric with hyphens, no leading/trailing hyphens",
    },
    pricing: {
      tiers: [
        { characters: "1-2", pricePerYear: "RESERVED", description: "Reserved — not available" },
        { characters: 3, pricePerYear: "$640", description: "Ultra-premium, on-chain NFT on Base" },
        { characters: 4, pricePerYear: "$160", description: "Premium, on-chain NFT on Base" },
        { characters: "5+", pricePerYear: "$10", description: "Standard handle — included with any active plan" },
      ],
      marketplaceFee: "2.5%",
      gracePeriodDays: 90,
      plans: [
        { name: "Starter", monthlyPrice: "$29/mo", yearlyPrice: "$290/yr", agents: 5, requestsPerMin: 1000, features: "First standard handle included, marketplace listing, email support" },
        { name: "Pro", monthlyPrice: "$79/mo", yearlyPrice: "$790/yr", agents: 25, requestsPerMin: 5000, features: "Fleet management, sub-handle delegation, priority support" },
        { name: "Enterprise", monthlyPrice: "Tailored", yearlyPrice: "Tailored", agents: null, requestsPerMin: null, features: "Custom agent count, tailored rate limits, dedicated infrastructure" },
      ],
    },
    capabilities: {
      programmaticRegistration: true,
      cryptographicVerification: true,
      protocolResolution: true,
      subdomainProvisioning: true,
      marketplaceListing: true,
      jobBoard: true,
      fleetManagement: true,
      handleTransfer: true,
      trustScoring: true,
      activityLogging: true,
      multiProtocol: true,
      wellKnownIdentity: true,
    },
  });
});

export default router;
