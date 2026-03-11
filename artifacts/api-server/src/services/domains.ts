import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentDomainsTable,
  agentsTable,
  type AgentDomain,
} from "@workspace/db/schema";
import { logActivity } from "./activity-logger";

const DEFAULT_BASE_DOMAIN = "agentid.dev";

function getBaseDomain(): string {
  return process.env.BASE_AGENT_DOMAIN ?? DEFAULT_BASE_DOMAIN;
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
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!apiToken || !zoneId) return null;
  return { apiToken, zoneId };
}

export async function getAgentDomain(
  agentId: string,
  userId: string,
): Promise<AgentDomain | null> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
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
    handle: agent.handle,
    status: record.status,
  };
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

  const fqdn = buildFqdn(agent.handle);

  const existing = await db.query.agentDomainsTable.findFirst({
    where: eq(agentDomainsTable.agentId, agentId),
  });

  if (existing && existing.status === "active") {
    return { success: true, domain: existing };
  }

  if (existing && (existing.status === "provisioning")) {
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
        updatedAt: new Date(),
      })
      .where(eq(agentDomainsTable.id, existing.id))
      .returning();

    if (cfConfig) {
      await createDnsRecords(cfConfig, fqdn, existing.id, agentId);
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
    await createDnsRecords(cfConfig, fqdn, domainRecord.id, agentId);
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

  const fqdn = buildFqdn(agent.handle);
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
    await createDnsRecords(cfConfig, fqdn, existing.id, agentId);
  }

  await logActivity({
    agentId,
    eventType: "agent.domain_reprovisioned",
    payload: { domain: fqdn, previousStatus: existing.status },
  });

  return { success: true, domain: updated };
}

async function createDnsRecords(
  config: CloudflareConfig,
  fqdn: string,
  domainRecordId: string,
  agentId: string,
): Promise<void> {
  const subdomain = fqdn.split(".")[0];
  const verificationTxt = `agentid-verify=${agentId}`;

  try {
    const headers = {
      "Authorization": `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    };
    const baseUrl = `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/dns_records`;

    const aRecordBody = {
      type: "A",
      name: subdomain,
      content: process.env.AGENT_PROXY_IP ?? "127.0.0.1",
      ttl: 1,
      proxied: true,
    };

    const txtRecordBody = {
      type: "TXT",
      name: subdomain,
      content: verificationTxt,
      ttl: 1,
    };

    const [aRes, txtRes] = await Promise.all([
      fetch(baseUrl, { method: "POST", headers, body: JSON.stringify(aRecordBody) }),
      fetch(baseUrl, { method: "POST", headers, body: JSON.stringify(txtRecordBody) }),
    ]);

    const aData = await aRes.json() as { success: boolean; result?: { id: string } };
    const txtData = await txtRes.json() as { success: boolean; result?: { id: string } };

    if (!aData.success || !txtData.success) {
      await db
        .update(agentDomainsTable)
        .set({
          status: "failed",
          providerMetadata: { error: "DNS record creation failed", aData, txtData },
          updatedAt: new Date(),
        })
        .where(eq(agentDomainsTable.id, domainRecordId));

      await logActivity({
        agentId,
        eventType: "agent.domain_provisioning_failed",
        payload: { domain: fqdn, aSuccess: aData.success, txtSuccess: txtData.success },
      });
      return;
    }

    const dnsRecords = {
      a: { id: aData.result?.id, type: "A", name: subdomain },
      txt: { id: txtData.result?.id, type: "TXT", name: subdomain, content: verificationTxt },
    };

    await db
      .update(agentDomainsTable)
      .set({
        status: "active",
        dnsRecords,
        providerMetadata: {
          provider: "cloudflare",
          zoneId: config.zoneId,
          aRecordId: aData.result?.id,
          txtRecordId: txtData.result?.id,
        },
        provisionedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentDomainsTable.id, domainRecordId));

    await logActivity({
      agentId,
      eventType: "agent.domain_provisioned",
      payload: { domain: fqdn, dnsRecords },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(agentDomainsTable)
      .set({
        status: "failed",
        providerMetadata: { error: message },
        updatedAt: new Date(),
      })
      .where(eq(agentDomainsTable.id, domainRecordId));

    await logActivity({
      agentId,
      eventType: "agent.domain_provisioning_failed",
      payload: { domain: fqdn, error: message },
    });
  }
}
