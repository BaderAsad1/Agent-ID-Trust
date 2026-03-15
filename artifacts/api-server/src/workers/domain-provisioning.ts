import { Queue, Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentDomainsTable } from "@workspace/db/schema";
import { getRedisConnectionOptions, isRedisConfigured } from "../lib/redis";
import { logActivity } from "../services/activity-logger";
import { logger } from "../middlewares/request-logger";

const QUEUE_NAME = "domain-provisioning";

export interface DomainProvisioningJobData {
  domainRecordId: string;
  agentId: string;
  fqdn: string;
  subdomain: string;
  apiToken: string;
  zoneId: string;
  proxyIp: string;
  attempt?: number;
}

let queue: Queue<DomainProvisioningJobData> | null = null;
let worker: Worker<DomainProvisioningJobData> | null = null;

export function getDomainQueue(): Queue<DomainProvisioningJobData> | null {
  if (!isRedisConfigured()) return null;
  if (queue) return queue;

  queue = new Queue(QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });

  return queue;
}

export async function enqueueDomainProvisioning(
  data: Omit<DomainProvisioningJobData, "attempt">,
): Promise<boolean> {
  const q = getDomainQueue();
  if (!q) return false;

  await q.add("provision", data, {
    jobId: `provision-${data.domainRecordId}`,
  });
  return true;
}

async function deleteExistingRecords(
  headers: Record<string, string>,
  baseUrl: string,
  fqdn: string,
): Promise<void> {
  try {
    const listRes = await fetch(`${baseUrl}?name=${fqdn}`, { headers });
    const listData = await listRes.json() as { success: boolean; result?: Array<{ id: string }> };
    if (listData.success && listData.result && listData.result.length > 0) {
      await Promise.all(
        listData.result.map((record) =>
          fetch(`${baseUrl}/${record.id}`, { method: "DELETE", headers }),
        ),
      );
    }
  } catch (err) {
    logger.warn({ fqdn, err: err instanceof Error ? err.message : String(err) }, "[domain-worker] Failed to delete existing DNS records");
  }
}

async function createAndVerifyDnsRecords(job: Job<DomainProvisioningJobData>): Promise<void> {
  const { domainRecordId, agentId, fqdn, subdomain, apiToken, zoneId, proxyIp } = job.data;
  const verificationTxt = `agentid-verify=${agentId}`;

  const headers = {
    "Authorization": `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };
  const baseUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;

  await deleteExistingRecords(headers, baseUrl, fqdn);

  const aRecordBody = {
    type: "A",
    name: subdomain,
    content: proxyIp,
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
    throw new Error(`DNS record creation failed for ${fqdn} (a: ${aData.success}, txt: ${txtData.success})`);
  }

  const dnsRecords = {
    a: { id: aData.result?.id, type: "A", name: subdomain },
    txt: { id: txtData.result?.id, type: "TXT", name: subdomain, content: verificationTxt },
  };

  await verifyDnsRecords(apiToken, zoneId, aData.result?.id, txtData.result?.id);

  await db
    .update(agentDomainsTable)
    .set({
      status: "active",
      dnsRecords,
      providerMetadata: {
        provider: "cloudflare",
        zoneId,
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
}

async function verifyDnsRecords(
  apiToken: string,
  zoneId: string,
  aRecordId?: string,
  txtRecordId?: string,
): Promise<void> {
  if (!aRecordId && !txtRecordId) return;

  const headers = { "Authorization": `Bearer ${apiToken}` };
  const baseUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;

  const maxAttempts = 3;
  const pollInterval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const checks = await Promise.all([
      aRecordId
        ? fetch(`${baseUrl}/${aRecordId}`, { headers }).then((r) => r.json() as Promise<{ success: boolean }>)
        : Promise.resolve({ success: true }),
      txtRecordId
        ? fetch(`${baseUrl}/${txtRecordId}`, { headers }).then((r) => r.json() as Promise<{ success: boolean }>)
        : Promise.resolve({ success: true }),
    ]);

    if (checks[0].success && checks[1].success) {
      return;
    }

    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error("DNS records not confirmed after polling — will retry via BullMQ backoff");
}

export function startDomainWorker(): Worker<DomainProvisioningJobData> | null {
  if (!isRedisConfigured()) {
    logger.info("[domain-worker] Redis not configured — domain worker disabled");
    return null;
  }

  if (worker) return worker;

  worker = new Worker<DomainProvisioningJobData>(
    QUEUE_NAME,
    async (job) => {
      logger.info({ jobId: job.id, fqdn: job.data.fqdn }, "[domain-worker] Processing job");
      await createAndVerifyDnsRecords(job);
      logger.info({ jobId: job.id, fqdn: job.data.fqdn }, "[domain-worker] Completed job");
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 3,
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    logger.error({ jobId: job.id, attempt: job.attemptsMade, maxAttempts: job.opts.attempts, error: err.message }, "[domain-worker] Job failed");

    if (job.attemptsMade >= (job.opts.attempts ?? 5)) {
      await db
        .update(agentDomainsTable)
        .set({
          status: "failed",
          providerMetadata: { error: err.message, exhaustedRetries: true },
          updatedAt: new Date(),
        })
        .where(eq(agentDomainsTable.id, job.data.domainRecordId));

      await logActivity({
        agentId: job.data.agentId,
        eventType: "agent.domain_provisioning_failed",
        payload: { domain: job.data.fqdn, error: err.message, retriesExhausted: true },
      });
    }
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job?.id }, "[domain-worker] Job completed successfully");
  });

  logger.info("[domain-worker] Domain provisioning worker started");
  return worker;
}

export async function closeDomainWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
