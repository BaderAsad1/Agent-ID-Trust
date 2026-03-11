import app from "./app";
import { startDomainWorker, closeDomainWorker } from "./workers/domain-provisioning";
import { initWebhookDeliveryWorker, closeWebhookWorker } from "./workers/webhook-delivery";
import { closeRedis } from "./lib/redis";
import { expireJobs } from "./services/jobs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

startDomainWorker();
initWebhookDeliveryWorker();

const JOB_EXPIRY_INTERVAL_MS = 60 * 1000;
let jobExpiryTimer: ReturnType<typeof setInterval> | null = null;

function startJobExpiryRunner() {
  jobExpiryTimer = setInterval(async () => {
    try {
      const count = await expireJobs();
      if (count > 0) {
        console.log(`[job-expiry] Expired ${count} job(s)`);
      }
    } catch (err) {
      console.error("[job-expiry] Error expiring jobs:", err);
    }
  }, JOB_EXPIRY_INTERVAL_MS);
}

startJobExpiryRunner();

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  if (jobExpiryTimer) clearInterval(jobExpiryTimer);
  server.close();
  await closeDomainWorker();
  await closeWebhookWorker();
  await closeRedis();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
