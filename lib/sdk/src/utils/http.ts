export class AgentIDError extends Error {
  public status: number;
  public code: string;
  public data?: unknown;

  constructor(status: number, code: string, message: string, data?: unknown) {
    super(message);
    this.name = "AgentIDError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export interface HttpClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export class HttpClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 15000;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "AgentID-Client/1.0 AgentID-SDK/1.0",
    };

    if (this.apiKey) {
      headers["X-Agent-Key"] = this.apiKey;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(text);
        } catch {
          // not JSON
        }

        throw new AgentIDError(
          res.status,
          (parsed.code as string) || (parsed.error as string) || "API_ERROR",
          (parsed.message as string) || (parsed.error as string) || `HTTP ${res.status}`,
          parsed.details,
        );
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return (await res.json()) as T;
      }
      return (await res.text()) as unknown as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
