type BootstrapBundle = {
  spec_version: string;
  agent_id: string;
  handle: string;
  display_name: string;
  protocol_address: string;
  provisional_domain: string;
  public_profile_url: string;
  inbox_id: string | null;
  inbox_address: string | null;
  inbox_poll_endpoint: string | null;
  trust: {
    score: number;
    tier: string;
    signals: Array<{ provider: string; label: string; score: number; maxScore: number }>;
  };
  capabilities: string[];
  auth_methods: string[];
  key_ids: Array<{ kid: string; key_type: string; status: string }>;
  status: string;
  prompt_block: string;
};

type RuntimeState = {
  agent_id: string;
  status: string;
  trust: {
    score: number;
    tier: string;
    signals: Array<{ provider: string; label: string; score: number; maxScore: number }>;
  };
  policy_limits: {
    rate_limit_rpm: number;
    max_payload_bytes: number;
    allowed_scopes: string[];
  };
  inbox_config: {
    inbox_id: string;
    poll_url: string;
    poll_interval_seconds: number;
    unread_count: number;
    address: string;
  } | null;
  capabilities: string[];
  last_heartbeat: string | null;
};

type HeartbeatResponse = {
  acknowledged: boolean;
  server_time: string;
  next_expected_heartbeat: string;
};

interface AgentIDRuntimeConfig {
  agentId: string;
  apiKey: string;
  baseUrl?: string;
}

class AgentIDRuntime {
  private agentId: string;
  private apiKey: string;
  private baseUrl: string;
  private bootstrap: BootstrapBundle | null = null;
  private runtimeState: RuntimeState | null = null;

  constructor(config: AgentIDRuntimeConfig) {
    this.agentId = config.agentId;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || "https://getagent.id").replace(/\/$/, "");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "X-Agent-Key": this.apiKey,
      "Accept": "application/json",
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AgentID API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async init(): Promise<BootstrapBundle> {
    this.bootstrap = await this.request<BootstrapBundle>(
      "GET",
      `/api/v1/agents/${this.agentId}/bootstrap`,
    );
    return this.bootstrap;
  }

  getBootstrap(): BootstrapBundle | null {
    return this.bootstrap;
  }

  getPromptBlock(): string {
    if (!this.bootstrap) {
      throw new Error("Call init() before getPromptBlock()");
    }
    return this.bootstrap.prompt_block;
  }

  async refreshRuntimeState(): Promise<RuntimeState> {
    this.runtimeState = await this.request<RuntimeState>(
      "GET",
      `/api/v1/agents/${this.agentId}/runtime`,
    );
    return this.runtimeState;
  }

  getRuntimeState(): RuntimeState | null {
    return this.runtimeState;
  }

  async heartbeat(options?: {
    endpointUrl?: string;
    runtimeContext?: { framework?: string; version?: string };
  }): Promise<HeartbeatResponse> {
    return this.request<HeartbeatResponse>(
      "POST",
      `/api/v1/agents/${this.agentId}/heartbeat`,
      {
        endpoint_url: options?.endpointUrl,
        runtime_context: options?.runtimeContext,
      },
    );
  }

  async pollInbox(options?: { limit?: number; offset?: number }): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    const qs = params.toString();
    return this.request<unknown>(
      "GET",
      `/api/v1/mail/agents/${this.agentId}/messages${qs ? `?${qs}` : ""}`,
    );
  }
}

export { AgentIDRuntime, type AgentIDRuntimeConfig, type BootstrapBundle, type RuntimeState, type HeartbeatResponse };
