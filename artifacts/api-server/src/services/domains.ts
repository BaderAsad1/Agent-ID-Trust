import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentDomainsTable,
  agentsTable,
  type AgentDomain,
} from "@workspace/db/schema";
import { logActivity } from "./activity-logger";
import { enqueueDomainProvisioning } from "../workers/domain-provisioning";
import { env } from "../lib/env";
import { agentOwnerWhere } from "./agents";

function getBaseDomain(): string {
  return env().BASE_AGENT_DOMAIN;
}

function handleToSubdomain(handle: string): string {
  return handle.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function buildFqdn(handle: string): string {
  return `${handleToSubdomain(handle)}.${getBaseDomain()}`;
}

interface CloudflareConfig {
  apiToken: string;
  zoneId: string;
}

function getCloudflareConfig(): CloudflareConfig | null {
  const config = env();
  const apiToken = config.CLOUDFLARE_API_TOKEN;
  const zoneId = config.CLOUDFLARE_ZONE_ID;
  if (!apiToken || !zoneId) return null;
  return { apiToken, zoneId };
}

export async function getAgentDomain(
  agentId: string,
  userId: string,
): Promise<AgentDomain | null> {
  const agent = await db.query.agentsTable.findFirst({
    where: agentOwnerWhere(agentId, userId),
    columns: { id: true },
  });
  if (!agent) return null;

  const domain = await db.query.agentDomainsTable.findFirst({
    where: eq(agentDomainsTable.agentId, agentId),
  });
  return domain ?? null;
}

export async function getDomainStatus(
  agentId: string,
  userId: string,
): Promise<{ status: string; domain: string | null; provisionedAt: Date | null; dnsRecords: unknown } | null> {
  const domain = await getAgentDomain(agentId, userId);
  if (!domain) return null;
  return {
    status: domain.status,
    domain: domain.domain,
    provisionedAt: domain.provisionedAt,
    dnsRecords: domain.dnsRecords,
  };
}

export async function resolveDomain(
  domain: string,
): Promise<{ agentId: string; handle: string; status: string } | null> {
  const record = await db.query.agentDomainsTable.findFirst({
    where: eq(agentDomainsTable.domain, domain.toLowerCase()),
  });
  if (!record) return null;

  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, record.agentId),
    columns: { id: true, handle: true, status: true },
  });
  if (!agent) return null;

  return {
    agentId: agent.id,
    handle: agent.handle ?? "",
    status: record.status,
  };
}

async function enqueueOrFallback(
  cfConfig: CloudflareConfig,
  domainRecordId: string,
  agentId: string,
  fqdn: string,
  subdomain: string,
): Promise<"queued" | "pending"> {
  const enqueued = await enqueueDomainProvisioning({
    domainRecordId,
    agentId,
    fqdn,
    subdomain,
    apiToken: cfConfig.apiToken,
    zoneId: cfConfig.zoneId,
    proxyIp: env().AGENT_PROXY_IP,
  });

  if (!enqueued) {
    await db
      .update(agentDomainsTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(agentDomainsTable.id, domainRecordId));
    return "pending";
  }
  return "queued";
}

export async function provisionDomain(
  agentId: string,
  userId: string,
): Promise<{ success: boolean; error?: string; domain?: AgentDomain }> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
    columns: { id: true, handle: true },
  });
  if (!agent) return { success: false, error: "AGENT_NOT_FOUND" };

  const fqdn = buildFqdn(agent.handle ?? "");
  const subdomain = handleToSubdomain(agent.handle ?? "");

  const existing = await db.query.agentDomainsTable.findFirst({
    where: eq(agentDomainsTable.agentId, agentId),
  });

  if (existing && existing.status === "active") {
    return { success: true, domain: existing };
  }

  if (existing && existing.status === "provisioning") {
    return { success: false, error: "PROVISIONING_IN_PROGRESS" };
  }

  const cfConfig = getCloudflareConfig();

  if (existing) {
    const [updated] = await db
      .update(agentDomainsTable)
      .set({
        domain: fqdn,
        baseDomain: getBaseDomain(),
        status: cfConfig ? "provisioning" : "pending",
        provisionedAt: null,
        dnsRecords: null,
        providerMetadata: null,
        updatedAt: new Date(),
      })
      .where(eq(agentDomainsTable.id, existing.id))
      .returning();

    if (cfConfig) {
      await enqueueOrFallback(cfConfig, existing.id, agentId, fqdn, subdomain);
    }

    await logActivity({
      agentId,
      eventType: "agent.domain_reprovisioned",
      payload: { domain: fqdn, status: updated.status },
    });

    return { success: true, domain: updated };
  }

  const [domainRecord] = await db
    .insert(agentDomainsTable)
    .values({
      agentId,
      domain: fqdn,
      baseDomain: getBaseDomain(),
      status: cfConfig ? "provisioning" : "pending",
    })
    .returning();

  await logActivity({
    agentId,
    eventType: "agent.domain_provisioning_started",
    payload: { domain: fqdn },
  });

  if (cfConfig) {
    await enqueueOrFallback(cfConfig, domainRecord.id, agentId, fqdn, subdomain);
  }

  return { success: true, domain: domainRecord };
}

export async function reprovisionDomain(
  agentId: string,
  userId: string,
): Promise<{ success: boolean; error?: string; domain?: AgentDomain }> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
    columns: { id: true, handle: true },
  });
  if (!agent) return { success: false, error: "AGENT_NOT_FOUND" };

  const existing = await db.query.agentDomainsTable.findFirst({
    where: eq(agentDomainsTable.agentId, agentId),
  });

  if (!existing) {
    return provisionDomain(agentId, userId);
  }

  if (existing.status === "provisioning") {
    return { success: false, error: "PROVISIONING_IN_PROGRESS" };
  }

  const fqdn = buildFqdn(agent.handle ?? "");
  const subdomain = handleToSubdomain(agent.handle ?? "");
  const cfConfig = getCloudflareConfig();

  const [updated] = await db
    .update(agentDomainsTable)
    .set({
      domain: fqdn,
      baseDomain: getBaseDomain(),
      status: cfConfig ? "provisioning" : "pending",
      provisionedAt: null,
      dnsRecords: null,
      providerMetadata: null,
      updatedAt: new Date(),
    })
    .where(eq(agentDomainsTable.id, existing.id))
    .returning();

  if (cfConfig) {
    await enqueueOrFallback(cfConfig, existing.id, agentId, fqdn, subdomain);
  }

  await logActivity({
    agentId,
    eventType: "agent.domain_reprovisioned",
    payload: { domain: fqdn, previousStatus: existing.status },
  });

  return { success: true, domain: updated };
}
