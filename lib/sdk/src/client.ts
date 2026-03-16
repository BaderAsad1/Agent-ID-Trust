import { HttpClient } from "./utils/http.js";
import { registerAgent as registerAgentHelper } from "./utils/crypto.js";
import { formatPromptBlock } from "./utils/prompt-block.js";
import { MailModule } from "./modules/mail.js";
import { TaskModule } from "./modules/tasks.js";
import { TrustModule } from "./modules/trust.js";
import { ResolveModule } from "./modules/resolve.js";
import { MarketplaceModule } from "./modules/marketplace.js";
import type {
  AgentIDConfig,
  BootstrapBundle,
  HeartbeatResponse,
  HeartbeatOptions,
  ResolutionResult,
  DiscoverOptions,
  DiscoverResult,
  AgentIDCredential,
  RegisterOptions,
  RegisterResult,
  SpawnSubagentOptions,
  SpawnSubagentResult,
  ListSubagentsOptions,
  ListSubagentsResult,
  TerminateSubagentResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://getagent.id";
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export class AgentID {
  private http: HttpClient;
  private bootstrap: BootstrapBundle | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _agentId: string;
  private _baseUrl: string;

  public mail: MailModule;
  public tasks: TaskModule;
  public trust: TrustModule;
  public marketplace: MarketplaceModule;

  private constructor(config: AgentIDConfig, agentId: string) {
    this._baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this._agentId = agentId;
    this.http = new HttpClient({
      baseUrl: this._baseUrl,
      apiKey: config.apiKey,
    });
    this.mail = new MailModule(this.http, this._agentId);
    this.tasks = new TaskModule(this.http, this._agentId);
    this.trust = new TrustModule(this.http, this._agentId);
    this.marketplace = new MarketplaceModule(this.http);
  }

  get agentId(): string {
    return this._agentId;
  }

  get handle(): string {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return `${this.bootstrap.handle}.agentID`;
  }

  get did(): string {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return `did:agentid:${this.bootstrap.handle}`;
  }

  get trustScore(): number {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return this.bootstrap.trust.score;
  }

  get trustTier(): string {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return this.bootstrap.trust.tier;
  }

  get inbox(): { id: string; address: string | null; pollEndpoint: string | null } | null {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    if (!this.bootstrap.inbox_id) return null;
    return {
      id: this.bootstrap.inbox_id,
      address: this.bootstrap.inbox_address,
      pollEndpoint: this.bootstrap.inbox_poll_endpoint,
    };
  }

  get resolverUrl(): string {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return `${this._baseUrl}/api/v1/resolve/${this.bootstrap.handle}`;
  }

  get capabilities(): string[] {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return this.bootstrap.capabilities;
  }

  static async init(config: AgentIDConfig): Promise<AgentID> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const http = new HttpClient({ baseUrl, apiKey: config.apiKey });

    let agentId: string;
    if (config.agentId) {
      agentId = config.agentId;
    } else {
      const whoami = await http.get<BootstrapBundle>("/api/v1/agents/whoami");
      agentId = whoami.agent_id;
    }

    const instance = new AgentID(config, agentId);
    await instance.fetchBootstrap();
    return instance;
  }

  private async fetchBootstrap(): Promise<void> {
    this.bootstrap = await this.http.get<BootstrapBundle>(
      `/api/v1/agents/${this._agentId}/bootstrap`,
    );
  }

  getCredential(): Promise<AgentIDCredential> {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return this.http.get<AgentIDCredential>(
      `/api/v1/p/${encodeURIComponent(this.bootstrap.handle)}/credential`,
    );
  }

  getPromptBlock(): string {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return this.bootstrap.prompt_block || formatPromptBlock(this.bootstrap);
  }

  async heartbeat(options?: HeartbeatOptions): Promise<HeartbeatResponse> {
    const response = await this.http.post<HeartbeatResponse>(
      `/api/v1/agents/${this._agentId}/heartbeat`,
      {
        endpoint_url: options?.endpointUrl,
        runtime_context: options?.runtimeContext,
      },
    );

    if (response.updateContext && response.identity && this.bootstrap) {
      this.bootstrap.trust = {
        ...this.bootstrap.trust,
        score: response.identity.trustScore,
        tier: response.identity.trustTier,
      };
      this.bootstrap.capabilities = response.identity.capabilities;
      this.bootstrap.status = response.identity.status;
      this.bootstrap.inbox_address = response.identity.inbox;
    }

    return response;
  }

  startHeartbeat(options?: HeartbeatOptions): void {
    this.stopHeartbeat();
    const doHeartbeat = async () => {
      try {
        const response = await this.heartbeat(options);
        if (response.mail?.hasNewMessages && options?.onNewMessages) {
          options.onNewMessages(response.mail);
        }
      } catch (_) {}
    };
    doHeartbeat();
    this.heartbeatTimer = setInterval(doHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  static async resolve(
    handle: string,
    baseUrl?: string,
  ): Promise<ResolutionResult> {
    return ResolveModule.resolve(handle, baseUrl);
  }

  static async discover(
    options?: DiscoverOptions,
    baseUrl?: string,
  ): Promise<DiscoverResult> {
    return ResolveModule.discover(options, baseUrl);
  }

  static async verifyCredential(
    credential: AgentIDCredential,
    baseUrl?: string,
  ): Promise<boolean> {
    return ResolveModule.verifyCredential(credential, baseUrl);
  }

  static async registerAgent(
    options: RegisterOptions,
    baseUrl = DEFAULT_BASE_URL,
  ): Promise<RegisterResult> {
    return registerAgentHelper(options, baseUrl);
  }

  async spawnSubagent(options: SpawnSubagentOptions): Promise<SpawnSubagentResult> {
    return this.http.post<SpawnSubagentResult>(
      `/api/v1/agents/${this._agentId}/subagents`,
      options,
    );
  }

  async listSubagents(options: ListSubagentsOptions = {}): Promise<ListSubagentsResult> {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.agentType) params.set("agentType", options.agentType);
    const qs = params.toString();
    return this.http.get<ListSubagentsResult>(
      `/api/v1/agents/${this._agentId}/subagents${qs ? `?${qs}` : ""}`,
    );
  }

  async terminateSubagent(subagentId: string): Promise<TerminateSubagentResult> {
    return this.http.delete<TerminateSubagentResult>(
      `/api/v1/agents/${this._agentId}/subagents/${subagentId}`,
    );
  }

  async rotateKey(options: {
    oldKeyId: string;
    newPublicKey: string;
    keyType?: string;
    reason?: string;
  }): Promise<{
    oldKey: Record<string, unknown>;
    newKey: Record<string, unknown>;
    rotationLogId: string;
    gracePeriodEnds: string;
    message: string;
  }> {
    return this.http.post(
      `/api/v1/agents/${this._agentId}/keys/rotate`,
      options,
    );
  }

  async verifyKeyRotation(rotationLogId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.http.post(
      `/api/v1/agents/${this._agentId}/keys/verify-rotation`,
      { rotationLogId },
    );
  }

  async registerWebhook(options: {
    url: string;
    events?: string[];
  }): Promise<{
    id: string;
    url: string;
    events: string[];
    active: boolean;
    secret: string;
    createdAt: string;
  }> {
    return this.http.post(
      `/api/v1/agents/${this._agentId}/webhooks`,
      options,
    );
  }

  async listWebhooks(): Promise<{
    webhooks: Array<{
      id: string;
      url: string;
      events: string[];
      active: boolean;
      consecutiveFailures: number;
      lastDeliveryAt: string | null;
      createdAt: string;
    }>;
  }> {
    return this.http.get(`/api/v1/agents/${this._agentId}/webhooks`);
  }

  async deleteWebhook(webhookId: string): Promise<{ success: boolean }> {
    return this.http.delete(
      `/api/v1/agents/${this._agentId}/webhooks/${webhookId}`,
    );
  }

  async attestAgent(
    subjectHandle: string,
    options: {
      sentiment: "positive" | "negative" | "neutral";
      category?: string;
      content?: string;
      signature: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.http.post(
      `/api/v1/agents/${this._agentId}/attest/${encodeURIComponent(subjectHandle)}`,
      options,
    );
  }

  async getSignedActivity(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ activities: Array<Record<string, unknown>> }> {
    const params = new URLSearchParams();
    params.set("source", "signed");
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    return this.http.get(
      `/api/v1/agents/${this._agentId}/activity?${params.toString()}`,
    );
  }
}
