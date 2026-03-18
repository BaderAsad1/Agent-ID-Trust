/**
 * M1: SSRF protection utilities shared across registration and delivery paths.
 *
 * Two-phase validation:
 *   Phase 1 — hostname pattern matching (fast, synchronous)
 *   Phase 2 — DNS resolution → A/AAAA records validated against blocklist
 *
 * Used by:
 *   - agent-webhooks.ts  (registration-time check)
 *   - webhook-delivery.ts (delivery-time check, including redirect hops)
 */

import dns from "dns/promises";
import { AppError } from "../middlewares/error-handler";

export const SSRF_BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^0\./,
  /^localhost$/i,
  /\.internal$/i,
  /\.local$/i,
];

export function isBlockedHostnameOrIp(value: string): boolean {
  return SSRF_BLOCKED_HOSTNAME_PATTERNS.some((p) => p.test(value));
}

/**
 * Resolve hostname and validate all resulting A/AAAA records against the blocklist.
 *
 * Throws an Error with code "SSRF_BLOCKED" if:
 * - The hostname matches the pattern blocklist directly (IP literal or known private domain)
 * - DNS resolution fails (fail-closed)
 * - Any resolved IP is in a private/reserved range (DNS rebinding defense)
 *
 * This function is used both at registration time AND at delivery time
 * (for each outbound request and each redirect hop) to prevent post-registration
 * DNS rebinding attacks.
 */
export async function resolveAndValidateHostname(hostname: string): Promise<void> {
  const h = hostname.toLowerCase();

  if (isBlockedHostnameOrIp(h)) {
    throw new AppError(400, "SSRF_BLOCKED", `Hostname targets a private or reserved address (${h})`);
  }

  try {
    const ipv4 = await dns.resolve(h).catch(() => null);
    const ipv6 = await dns.resolve6(h).catch(() => null);
    const records: string[] = [...(ipv4 ?? []), ...(ipv6 ?? [])];

    if (records.length === 0) {
      throw new AppError(400, "SSRF_BLOCKED", `Hostname ${h} could not be resolved`);
    }

    for (const ip of records) {
      if (isBlockedHostnameOrIp(ip)) {
        throw new AppError(400, "SSRF_BLOCKED", `Hostname ${h} resolves to a private or reserved IP (${ip})`);
      }
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, "SSRF_BLOCKED", `Hostname ${h} could not be resolved`);
  }
}

/**
 * Validate that `url` is a safe HTTPS webhook destination.
 *
 * Throws AppError("INVALID_WEBHOOK_URL") if the URL is not a valid HTTPS URL.
 * Throws AppError("SSRF_BLOCKED") if the URL targets a private/reserved address.
 */
export async function validateWebhookUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(400, "INVALID_WEBHOOK_URL", "Webhook URL is not a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new AppError(400, "INVALID_WEBHOOK_URL", "Webhook URL must use HTTPS");
  }

  await resolveAndValidateHostname(parsed.hostname);
}

const MAX_REDIRECT_HOPS = 3;

/**
 * SSRF-safe fetch for all outbound webhook requests.
 *
 * Before every request (initial + each redirect hop):
 * 1. Validates HTTPS scheme
 * 2. Resolves all A/AAAA DNS records and validates against SSRF blocklist
 *    — prevents DNS rebinding (hostname re-pointed after registration)
 * 3. Uses redirect:"manual" and inspects each Location header before following
 *
 * Used by webhook-delivery.ts (scheduled delivery, retries) AND by the
 * webhook test endpoint in agent-webhooks.ts.
 */
export async function ssrfSafeFetch(
  url: string,
  init: RequestInit,
  hopsRemaining: number = MAX_REDIRECT_HOPS,
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SSRF_BLOCKED: unparseable delivery URL");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("SSRF_BLOCKED: non-HTTPS delivery URL");
  }

  await resolveAndValidateHostname(parsed.hostname);

  const response = await fetch(url, { ...init, redirect: "manual" });

  if (response.status >= 300 && response.status < 400) {
    if (hopsRemaining <= 0) {
      throw new Error("TOO_MANY_REDIRECTS");
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("SSRF_BLOCKED: redirect with no Location header");
    }

    let redirectUrl: URL;
    try {
      redirectUrl = new URL(location, url);
    } catch {
      throw new Error("SSRF_BLOCKED: redirect to unparseable URL");
    }

    if (redirectUrl.protocol !== "https:") {
      throw new Error("SSRF_BLOCKED: redirect to non-HTTPS URL");
    }

    return ssrfSafeFetch(redirectUrl.toString(), init, hopsRemaining - 1);
  }

  return response;
}
