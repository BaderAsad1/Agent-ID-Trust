import { retryPendingDeliveries } from "../services/webhook-delivery";
import { logger } from "../middlewares/request-logger";

const RETRY_INTERVAL_MS = 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

export function startWebhookRetryWorker() {
  if (timer) return;

  logger.info("[webhook-retry] Starting webhook retry worker (60s interval)");

  timer = setInterval(async () => {
    try {
      await retryPendingDeliveries();
    } catch (err) {
      logger.error({ err }, "[webhook-retry] Error retrying pending deliveries");
    }
  }, RETRY_INTERVAL_MS);
}

export function stopWebhookRetryWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
