import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentKeysTable, agentDomainsTable } from "@workspace/db/schema";
import { normalizeHandle, formatHandle, formatDomain, formatDID, formatProfileUrl, formatResolverUrl } from "../utils/handle";

const router = Router();

const BASE_DOMAIN = process.env.BASE_AGENT_DOMAIN || "getagent.id";
const APP_URL = process.env.APP_URL || "https://getagent.id";

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
      eq(agentsTable.status, "active"),
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
  const handle = normalizeHandle(agent.handle);
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
      res.status(404).json({
        error: "AGENT_NOT_FOUND",
        message: "No agent identity found for this domain. Resolve agents via GET /api/v1/resolve/:handle",
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
    credentialEndpoint: `${APP_URL}/.well-known/agent.json`,
    resolutionEndpoint: `${APP_URL}/api/v1/resolve`,
    erc8004Endpoint: `${APP_URL}/api/v1/resolve`,
    wellKnownPath: "/.well-known/agent.json",
    baseDomain: BASE_DOMAIN,
    documentation: "https://docs.getagent.id",
    sdkPackage: "@agentid/resolver",
  });
});

export default router;
