import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, agentDomainsTable } from "@workspace/db/schema";
import { formatDomain } from "../utils/handle";

export interface RegistryStatus {
  registered: boolean;
  domain: string;
  resolveUrl: string;
  dnsbridge: string;
  status: string;
  registeredAt: string | null;
}

export async function getRegistryStatus(
  agentId: string,
  userId: string,
): Promise<RegistryStatus> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(eq(agentsTable.id, agentId), eq(agentsTable.userId, userId)),
    columns: { id: true, handle: true, createdAt: true },
  });

  if (!agent) {
    return {
      registered: false,
      domain: "",
      resolveUrl: "",
      dnsbridge: "",
      status: "not_found",
      registeredAt: null,
    };
  }

  const domainRecord = await db.query.agentDomainsTable.findFirst({
    where: eq(agentDomainsTable.agentId, agent.id),
    columns: { status: true },
  });

  const domain = formatDomain(agent.handle ?? "");
  const config = (await import("../lib/env")).env();
  const baseDomain = config.BASE_AGENT_DOMAIN;
  const appBase = config.APP_URL;
  const apiBase = `${appBase}/api/v1`;

  const domainStatus = domainRecord?.status || "pending";
  const isRegistered = domainStatus !== "pending" && domainStatus !== "failed" && domainStatus !== "deprovisioned";

  return {
    registered: isRegistered,
    domain,
    resolveUrl: `${apiBase}/resolve/${agent.handle}`,
    dnsbridge: `${agent.handle}.${baseDomain}`,
    status: domainStatus,
    registeredAt: agent.createdAt.toISOString(),
  };
}
