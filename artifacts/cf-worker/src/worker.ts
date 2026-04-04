const PASSTHROUGH_SUBDOMAINS = new Set(["www", "pay"]);

const ORIGIN = "https://getagent.id";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname;

    if (host === "getagent.id") {
      return fetch(request);
    }

    const subdomain = extractSubdomain(host);

    if (!subdomain || PASSTHROUGH_SUBDOMAINS.has(subdomain)) {
      return fetch(request);
    }

    const originUrl = new URL(`/${subdomain}${url.pathname}`, ORIGIN);
    originUrl.search = url.search;

    const headers = new Headers(request.headers);
    headers.set("Host", "getagent.id");
    headers.set("X-Forwarded-Host", host);
    headers.set("X-Original-Host", host);

    const originRequest = new Request(originUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });

    const response = await fetch(originRequest);

    const responseHeaders = new Headers(response.headers);

    const locationHeader = responseHeaders.get("Location");
    if (locationHeader) {
      const rewritten = rewriteLocationHeader(locationHeader, subdomain, host, originUrl.toString());
      if (rewritten !== locationHeader) {
        responseHeaders.set("Location", rewritten);
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
} satisfies ExportedHandler;

function extractSubdomain(hostname: string): string | null {
  const suffix = ".getagent.id";
  if (!hostname.endsWith(suffix)) return null;
  const sub = hostname.slice(0, -suffix.length);
  if (!sub || sub.includes(".")) return null;
  return sub;
}

function hasHandlePrefix(pathname: string, handle: string): boolean {
  return pathname === `/${handle}` || pathname.startsWith(`/${handle}/`);
}

function stripHandlePrefix(pathname: string, handle: string): string {
  if (pathname === `/${handle}`) return "/";
  return pathname.slice(`/${handle}`.length);
}

function rewriteLocationHeader(
  location: string,
  handle: string,
  originalHost: string,
  baseUrl: string,
): string {
  let resolved: URL;
  try {
    resolved = new URL(location, baseUrl);
  } catch {
    return location;
  }

  if (resolved.hostname === "getagent.id" && hasHandlePrefix(resolved.pathname, handle)) {
    resolved.hostname = originalHost;
    resolved.pathname = stripHandlePrefix(resolved.pathname, handle);
    return resolved.toString();
  }

  return location;
}
