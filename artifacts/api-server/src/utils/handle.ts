const BASE_DOMAIN = process.env.BASE_AGENT_DOMAIN || "getagent.id";
const APP_URL = process.env.APP_URL || "https://getagent.id";

const SUFFIX_RE = /\.(agentid|agent)$/i;

export function normalizeHandle(raw: string): string {
  return raw.toLowerCase().replace(SUFFIX_RE, "");
}

export function formatHandle(handle: string): string {
  return `${normalizeHandle(handle)}.agentid`;
}

export function formatResolverUrl(handle: string): string {
  return `${APP_URL}/api/v1/resolve/${normalizeHandle(handle)}`;
}

export function formatDID(handle: string): string {
  return `did:agentid:${normalizeHandle(handle)}`;
}

export function formatInboxAddress(handle: string): string {
  return `${normalizeHandle(handle)}@inbox.${BASE_DOMAIN}`;
}

export function formatDomain(handle: string): string {
  return `${normalizeHandle(handle)}.${BASE_DOMAIN}`;
}

export function formatProfileUrl(handle: string): string {
  return `${APP_URL}/${normalizeHandle(handle)}`;
}
