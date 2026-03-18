import { validateEnv, env } from "./lib/env";

validateEnv();
const config = env();

import app from "./app";
import { startDomainWorker, closeDomainWorker } from "./workers/domain-provisioning";
import { initWebhookDeliveryWorker, closeWebhookWorker } from "./workers/webhook-delivery";
import { initEmailDeliveryWorker, closeEmailWorker } from "./workers/email-delivery";
import { initUndeliverableCleanupWorker, stopUndeliverableCleanupWorker } from "./workers/undeliverable-cleanup";
import { initOutboundMailWorker, closeOutboundMailWorker } from "./workers/outbound-mail";
import { startAgentExpiryWorker, stopAgentExpiryWorker } from "./workers/agent-expiry";
import { closeOutboundQueue } from "./services/mail-transport";
import { closeRedis } from "./lib/redis";
import { expireJobs } from "./services/jobs";
import { logger } from "./middlewares/request-logger";

const port = Number(config.PORT);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${config.PORT}"`);
}

logger.info({ subsystems: {
  redis: !!config.REDIS_URL,
  stripe: !!config.STRIPE_SECRET_KEY,
  resend: !!config.RESEND_API_KEY,
  cloudflare: !!(config.CLOUDFLARE_API_TOKEN && config.CLOUDFLARE_ZONE_ID),
  hmac: !!config.ACTIVITY_HMAC_SECRET,
  webhookKey: !!(config.WEBHOOK_SECRET_KEY || config.ACTIVITY_HMAC_SECRET),
  credSign: !!config.CREDENTIAL_SIGNING_SECRET,
} }, "[startup] Subsystem status");

const isProd = config.NODE_ENV === "production";

if (isProd && !config.ACTIVITY_HMAC_SECRET) {
  throw new Error("ACTIVITY_HMAC_SECRET is required in production.");
}
if (isProd && !config.WEBHOOK_SECRET_KEY) {
  throw new Error("WEBHOOK_SECRET_KEY is required in production for encryption at rest.");
}
if (isProd && !config.CREDENTIAL_SIGNING_SECRET) {
  throw new Error("CREDENTIAL_SIGNING_SECRET is required in production for credential signing.");
}

import { getCredentialSigningSecret } from "./services/credentials";
try {
  getCredentialSigningSecret();
} catch (err) {
  if (isProd) throw err;
}

if (!config.REDIS_URL) {
  logger.warn("[startup] Redis is not configured — BullMQ webhook delivery queue and domain provisioning worker are disabled.");
}

const STRIPE_PRICE_VARS = [
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_STARTER_YEARLY",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
];
const missingPriceIds = STRIPE_PRICE_VARS.filter((v) => !process.env[v]);
if (missingPriceIds.length > 0) {
  logger.warn(
    { missingVars: missingPriceIds },
    "[startup] Stripe price ID env vars not set — billing plans will return null priceIds. Set these from your Stripe dashboard: " + missingPriceIds.join(", "),
  );
}

import { startTrustWorker, stopTrustWorker } from "./workers/trust-recalculation";
import { startWebhookRetryWorker, stopWebhookRetryWorker } from "./workers/webhook-retry";
import { startHandleLifecycleWorker, stopHandleLifecycleWorker } from "./workers/handle-lifecycle";

startDomainWorker();
initWebhookDeliveryWorker();
initEmailDeliveryWorker();
initUndeliverableCleanupWorker();
initOutboundMailWorker();
startAgentExpiryWorker();
startTrustWorker();
startWebhookRetryWorker();
startHandleLifecycleWorker();

const JOB_EXPIRY_INTERVAL_MS = 60 * 1000;
let jobExpiryTimer: ReturnType<typeof setInterval> | null = null;

function startJobExpiryRunner() {
  jobExpiryTimer = setInterval(async () => {
    try {
      const count = await expireJobs();
      if (count > 0) {
        logger.info({ expiredCount: count }, "[job-expiry] Expired jobs");
      }
    } catch (err) {
      logger.error({ err }, "[job-expiry] Error expiring jobs");
    }
  }, JOB_EXPIRY_INTERVAL_MS);
}

startJobExpiryRunner();

const server = app.listen(port, () => {
  logger.info({ port }, `Server listening on port ${port}`);
});

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  if (jobExpiryTimer) clearInterval(jobExpiryTimer);
  stopTrustWorker();
  stopWebhookRetryWorker();
  await stopAgentExpiryWorker();
  await stopHandleLifecycleWorker();
  server.close();
  await closeDomainWorker();
  await closeWebhookWorker();
  await closeEmailWorker();
  stopUndeliverableCleanupWorker();
  await closeOutboundMailWorker();
  await closeOutboundQueue();
  await closeRedis();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
