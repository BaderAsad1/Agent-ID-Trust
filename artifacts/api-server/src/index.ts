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

import { isRedisConfigured } from "./lib/redis";

const isProd = process.env.NODE_ENV === "production";

if (isProd && !process.env.ACTIVITY_HMAC_SECRET) {
  throw new Error("ACTIVITY_HMAC_SECRET is required in production.");
}
if (isProd && !process.env.WEBHOOK_SECRET_KEY) {
  throw new Error("WEBHOOK_SECRET_KEY is required in production for encryption at rest.");
}

console.log("[startup] Subsystem status:");
console.log(`  Redis:      ${isRedisConfigured() ? "enabled" : "disabled (REDIS_URL not set)"}`);
console.log(`  Stripe:     ${process.env.STRIPE_SECRET_KEY ? "enabled" : "disabled (STRIPE_SECRET_KEY not set)"}`);
console.log(`  Resend:     ${process.env.RESEND_API_KEY ? "enabled" : "disabled (RESEND_API_KEY not set)"}`);
console.log(`  Cloudflare: ${process.env.CLOUDFLARE_API_TOKEN ? "enabled" : "disabled (CLOUDFLARE_API_TOKEN not set)"}`);
console.log(`  HMAC:       ${process.env.ACTIVITY_HMAC_SECRET ? "enabled" : "ephemeral (dev only)"}`);
console.log(`  Crypto Key: ${process.env.WEBHOOK_SECRET_KEY || process.env.ACTIVITY_HMAC_SECRET ? "enabled" : "ephemeral (dev only)"}`);

if (!isRedisConfigured()) {
  console.warn("[startup] Redis is not configured — BullMQ webhook delivery queue and domain provisioning worker are disabled.");
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

if (!process.env.RESEND_API_KEY) {
  console.warn("[email] RESEND_API_KEY is not set — external email delivery is disabled.");
}

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
