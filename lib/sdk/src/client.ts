import { HttpClient } from "./utils/http.js";
import { registerAgent as registerAgentHelper } from "./utils/crypto.js";
import { formatPromptBlock } from "./utils/prompt-block.js";
import { MailModule } from "./modules/mail.js";
import { TaskModule } from "./modules/tasks.js";
import { TrustModule } from "./modules/trust.js";
import { ResolveModule } from "./modules/resolve.js";
import { MarketplaceModule } from "./modules/marketplace.js";
import { MppModule } from "./modules/mpp.js";
import { HandleModule } from "./modules/handles.js";
import { WalletModule } from "./modules/wallet.js";
import { BillingModule } from "./modules/billing.js";
import { ApiKeysModule } from "./modules/api-keys.js";
import { OAuthClientsModule } from "./modules/oauth-clients.js";
import { OrganizationsModule } from "./modules/organizations.js";
import { FleetModule } from "./modules/fleet.js";
import { JobsModule } from "./modules/jobs.js";
import { DomainsModule } from "./modules/domains.js";
import { VerificationModule } from "./modules/verification.js";
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
  PersistedAgentState,
} from "./types.js";

const DEFAULT_BASE_URL = "https://getagent.id";
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export class AgentID {
  private http: HttpClient;
  private bootstrap: BootstrapBundle | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _agentId: string;
  private _baseUrl: string;
  private _apiKey: string;

  public mail: MailModule;
  public tasks: TaskModule;
  public trust: TrustModule;
  public marketplace: MarketplaceModule;
  public mpp: MppModule;
  public handles: HandleModule;
  public wallet: WalletModule;
  public billing: BillingModule;
  public apiKeys: ApiKeysModule;
  public oauthClients: OAuthClientsModule;
  public orgs: OrganizationsModule;
  public fleet: FleetModule;
  public jobs: JobsModule;
  public domains: DomainsModule;
  public verification: VerificationModule;

  private constructor(config: AgentIDConfig, agentId: string) {
    this._baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this._agentId = agentId;
    this._apiKey = config.apiKey;
    this.http = new HttpClient({
      baseUrl: this._baseUrl,
      apiKey: config.apiKey,
    });
    this.mail = new MailModule(this.http, this._agentId);
    this.tasks = new TaskModule(this.http, this._agentId);
    this.trust = new TrustModule(this.http, this._agentId);
    this.marketplace = new MarketplaceModule(this.http, this._agentId);
    this.mpp = new MppModule(this.http, this._agentId);
    this.handles = new HandleModule(this.http, this._agentId);
    this.wallet = new WalletModule(this.http, this._agentId);
    this.billing = new BillingModule(this.http);
    this.apiKeys = new ApiKeysModule(this.http);
    this.oauthClients = new OAuthClientsModule(this.http);
    this.orgs = new OrganizationsModule(this.http);
    this.fleet = new FleetModule(this.http);
    this.jobs = new JobsModule(this.http);
    this.domains = new DomainsModule(this.http);
    this.verification = new VerificationModule(this.http);
  }

  get agentId(): string {
    return this._agentId;
  }

  private resolvedHandle(): string | null {
    if (!this.bootstrap) return null;
    return this.bootstrap.handle || this.bootstrap.agent?.handle || null;
  }

  get handle(): string | null {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    const h = this.resolvedHandle();
    return h ? `${h}.agentid` : null;
  }

  get did(): string {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return `did:web:getagent.id:agents:${this._agentId}`;
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
    const h = this.resolvedHandle();
    return h
      ? `${this._baseUrl}/api/v1/resolve/${h}`
      : `${this._baseUrl}/api/v1/resolve/id/${this._agentId}`;
  }

  get capabilities(): string[] {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return this.bootstrap.capabilities;
  }

  get isOwned(): boolean {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return this.bootstrap.is_owned;
  }

  getClaimUrl(): string | null {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return this.bootstrap.claim_url;
  }

  static async init(config: AgentIDConfig): Promise<AgentID> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const http = new HttpClient({ baseUrl, apiKey: config.apiKey });

    let agentId: string;
    if (config.agentId) {
      agentId = config.agentId;
    } else {
      const whoami = await http.get<BootstrapBundle>("/api/v1/agents/whoami");
      const resolvedId =
        whoami.agent_id ||
        whoami.machine_identity?.agent_id ||
        whoami.machineIdentity?.agentId ||
        whoami.id;
      if (!resolvedId) {
        throw new Error(
          "AgentID.init(): could not resolve agent_id from whoami response. " +
          "Expected field: agent_id, machine_identity.agent_id, or machineIdentity.agentId.",
        );
      }
      agentId = resolvedId;
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
    const h = this.resolvedHandle() || this._agentId;
    return this.http.get<AgentIDCredential>(
      `/api/v1/p/${encodeURIComponent(h)}/credential`,
    );
  }

  getPromptBlock(): string {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    return formatPromptBlock(this.bootstrap);
  }

  /**
   * The agent's identity block, ready to inject into a system prompt.
   *
   * Available immediately after `AgentID.init()` — no extra API call needed.
   * For the full cold-start sequence (heartbeat + marketplace), call `coldStart()`.
   *
   * @example
   * ```ts
   * const agent = await AgentID.init({ apiKey: process.env.AGENTID_API_KEY! });
   * const response = await openai.chat.completions.create({
   *   model: "gpt-4o",
   *   messages: [
   *     { role: "system", content: agent.systemContext },
   *     { role: "user",   content: userMessage },
   *   ],
   * });
   * ```
   */
  get systemContext(): string {
    if (!this.bootstrap) return "";
    return formatPromptBlock(this.bootstrap);
  }

  async getIdentityContent(format: "openclaw" | "claude" | "generic" | "json" = "generic"): Promise<string> {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    const agentId = this._agentId;
    if (!agentId) throw new Error("Agent ID is not set.");

    const url = `/api/v1/agents/${encodeURIComponent(agentId)}/identity-file?format=${format}`;

    if (format === "json") {
      const data = await this.http.get<Record<string, unknown>>(url);
      return JSON.stringify(data, null, 2);
    }

    const data = await this.http.get<string>(url);
    return typeof data === "string" ? data : JSON.stringify(data);
  }

  async writeIdentityFile(filePath: string, format: "openclaw" | "claude" | "generic" | "json" = "generic"): Promise<void> {
    const content = await this.getIdentityContent(format);
    const { writeFile, mkdir } = await import("fs/promises");
    const { dirname } = await import("path");
    const dir = dirname(filePath);
    if (dir && dir !== ".") {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, content, "utf-8");
  }

  /**
   * Execute the full Agent ID cold-start sequence.
   *
   * Call this **once at process startup**, before the first user turn.
   * Returns everything needed to hydrate the agent's system context.
   *
   * Sequence:
   * 1. Send heartbeat (marks agent online, gets state deltas)
   * 2. Refresh prompt block / bootstrap if heartbeat signals a change
   * 3. Fetch marketplace context if any action is required
   *
   * Falls back to cached bootstrap on any network failure so the agent
   * always boots — even offline.
   *
   * @example
   * ```ts
   * const client = await AgentID.init({ apiKey: process.env.AGENTID_API_KEY! });
   * const { systemContext, stale } = await client.coldStart();
   * // → inject systemContext into your framework's system prompt
   * ```
   */
  async coldStart(): Promise<{
    systemContext: string;
    promptBlock: string;
    heartbeat: HeartbeatResponse | null;
    marketplace: Record<string, unknown> | null;
    stale: boolean;
    staleReasons: string[];
  }> {
    const staleReasons: string[] = [];
    let hbResponse: HeartbeatResponse | null = null;
    let marketplace: Record<string, unknown> | null = null;

    // 1. Heartbeat ──────────────────────────────────────────────────────────
    try {
      hbResponse = await this.heartbeat();
    } catch (err) {
      staleReasons.push(`heartbeat: ${err}`);
    }

    // 2. Refresh bootstrap if signalled or not yet loaded ───────────────────
    const needsBootstrapRefresh =
      !this.bootstrap ||
      (hbResponse as unknown as Record<string, unknown>)?.stateDelta &&
      (hbResponse as unknown as Record<string, unknown>).stateDelta !== null;

    if (needsBootstrapRefresh) {
      try {
        await this.fetchBootstrap();
      } catch (err) {
        staleReasons.push(`bootstrap: ${err}`);
      }
    }

    // 3. Marketplace context (only when action required) ───────────────────
    const stateDelta = (hbResponse as unknown as Record<string, unknown>)?.stateDelta as Record<string, unknown> | undefined;
    const alerts = stateDelta?.marketplace_alerts as Record<string, unknown> | undefined;
    if (alerts?.any_action_required) {
      try {
        marketplace = await this.http.get<Record<string, unknown>>(
          `/api/v1/agents/${this._agentId}/marketplace/context`,
        );
      } catch (err) {
        staleReasons.push(`marketplace/context: ${err}`);
      }
    }

    const promptBlock = this.bootstrap ? formatPromptBlock(this.bootstrap) : "";

    return {
      systemContext: promptBlock,
      promptBlock,
      heartbeat: hbResponse,
      marketplace,
      stale: staleReasons.length > 0,
      staleReasons,
    };
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
      } catch (err) {
        if (options?.onError) {
          options.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
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

  // ── Autonomous OAuth ────────────────────────────────��───────────────────────

  /**
   * Autonomously approve an OAuth authorization request as this agent.
   *
   * The agent authenticates itself (via API key) and consents to the OAuth
   * request on its own behalf — no human session or browser required.
   *
   * @param params.clientId          OAuth client requesting access.
   * @param params.redirectUri       Registered redirect URI for the client.
   * @param params.scopes            Scopes to grant (default: `["read"]`).
   * @param params.state             Opaque state value (CSRF token).
   * @param params.codeChallenge     PKCE challenge (required for public clients).
   * @param params.codeChallengeMethod  PKCE method — only "S256" is accepted.
   *
   * @returns `{ code, redirectUrl, state }` — follow `redirectUrl` to deliver
   *          the authorization code to the third-party app.
   *
   * @example
   * ```typescript
   * const result = await agent.authorizeOAuthClient({
   *   clientId:      "agclient_thirdparty",
   *   redirectUri:   "https://thirdparty.com/callback",
   *   scopes:        ["read", "agents:read"],
   *   codeChallenge: myPkceChallenge,
   *   state:         myState,
   * });
   * // result.redirectUrl → follow this to complete the flow
   * ```
   */
  async authorizeOAuthClient(params: {
    clientId: string;
    redirectUri: string;
    scopes?: string[];
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: "S256";
  }): Promise<{ code: string; redirectUrl: string; state: string | null }> {
    const body: Record<string, string> = {
      client_id:    params.clientId,
      redirect_uri: params.redirectUri,
      scope:        (params.scopes ?? ["read"]).join(" "),
    };
    if (params.state)          body.state                 = params.state;
    if (params.codeChallenge)  body.code_challenge        = params.codeChallenge;
    if (params.codeChallengeMethod) body.code_challenge_method = params.codeChallengeMethod;

    const data = await this.http.post<{ code: string; redirect_url: string; state: string | null }>(
      "/oauth/authorize/agent",
      body,
    );
    return { code: data.code, redirectUrl: data.redirect_url, state: data.state };
  }

  /**
   * Complete a full OAuth flow autonomously from an authorization URL.
   *
   * Given the `authorizationUrl` that a third-party app redirected the agent to
   * (e.g. `https://getagent.id/oauth/authorize?client_id=...`), this method:
   * 1. Parses the URL parameters.
   * 2. Generates a PKCE `code_verifier` / `code_challenge` pair.
   * 3. Calls `authorizeOAuthClient` to approve consent.
   * 4. Exchanges the code for an access + refresh token pair.
   *
   * @param authorizationUrl  The full `/oauth/authorize?...` URL.
   * @returns Token response `{ access_token, refresh_token, expires_in, scope, ... }`.
   *
   * @example
   * ```typescript
   * const tokens = await agent.completeOAuthFlow(
   *   "https://getagent.id/oauth/authorize?client_id=agclient_thirdparty&..."
   * );
   * console.log(tokens.access_token);
   * ```
   */
  async completeOAuthFlow(authorizationUrl: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
    code: string;
    redirectUrl: string;
    state: string | null;
  }> {
    const url = new URL(authorizationUrl);
    const clientId   = url.searchParams.get("client_id");
    const redirectUri = url.searchParams.get("redirect_uri");
    const scope      = url.searchParams.get("scope") ?? "read";
    const state      = url.searchParams.get("state") ?? undefined;

    if (!clientId)   throw new Error("authorization_url missing client_id");
    if (!redirectUri) throw new Error("authorization_url missing redirect_uri");

    // Generate PKCE pair
    const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = btoa(String.fromCharCode(...verifierBytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const challengeBytes = await crypto.subtle.digest(
      "SHA-256", new TextEncoder().encode(verifier),
    );
    const challenge = btoa(String.fromCharCode(...new Uint8Array(challengeBytes)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const authResult = await this.authorizeOAuthClient({
      clientId,
      redirectUri,
      scopes:              scope.split(" ").filter(Boolean),
      state,
      codeChallenge:       challenge,
      codeChallengeMethod: "S256",
    });

    // Exchange the code for tokens
    const tokenBody = new URLSearchParams({
      grant_type:    "authorization_code",
      code:          authResult.code,
      client_id:     clientId,
      redirect_uri:  redirectUri,
      code_verifier: verifier,
    });
    const tokenData = await this.http.post<{
      access_token: string; refresh_token: string;
      expires_in: number; token_type: string; scope: string;
    }>("/oauth/token", Object.fromEntries(tokenBody));

    return { ...authResult, ...tokenData };
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

  /**
   * Export the agent's durable state to a plain object.
   *
   * Permanent fields (agentId, apiKey, did, baseUrl) can be persisted safely.
   * Mutable fields (handle, cachedBootstrap) are included as a cache snapshot
   * and should be refreshed with refreshBootstrap() on next startup.
   */
  exportState(): PersistedAgentState {
    if (!this.bootstrap) throw new Error("Agent not initialized. Call AgentID.init() first.");
    const h = this.resolvedHandle();
    return {
      version: 1,
      baseUrl: this._baseUrl,
      agentId: this._agentId,
      apiKey: this._apiKey,
      did: `did:web:getagent.id:agents:${this._agentId}`,
      handle: h || null,
      resolverUrl: this.resolverUrl,
      profileUrl: this.bootstrap.public_profile_url || `${this._baseUrl}/id/${this._agentId}`,
      savedAt: new Date().toISOString(),
      cachedBootstrap: this.bootstrap,
    };
  }

  /**
   * Write the durable state to a JSON file on disk.
   * Restores with AgentID.readStateFile(path).
   */
  async writeStateFile(filePath: string): Promise<void> {
    const state = this.exportState();
    const { writeFile, mkdir } = await import("fs/promises");
    const { dirname } = await import("path");
    const dir = dirname(filePath);
    if (dir && dir !== ".") {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
  }

  /**
   * Restore an AgentID instance from a previously exported state object.
   * The agent is ready to use without re-registration. Call refreshBootstrap()
   * afterwards to ensure mutable fields (trust, status, capabilities, inbox)
   * are current.
   */
  static fromState(state: PersistedAgentState): AgentID {
    if (state.version !== 1) {
      throw new Error(`Unsupported state version: ${state.version}. Expected 1.`);
    }
    const instance = new AgentID(
      { apiKey: state.apiKey, agentId: state.agentId, baseUrl: state.baseUrl },
      state.agentId,
    );
    if (state.cachedBootstrap) {
      instance.bootstrap = state.cachedBootstrap;
    }
    return instance;
  }

  /**
   * Read agent state from a JSON file on disk and restore an AgentID instance.
   * Equivalent to AgentID.fromState(JSON.parse(file)).
   */
  static async readStateFile(filePath: string): Promise<AgentID> {
    const { readFile } = await import("fs/promises");
    const raw = await readFile(filePath, "utf-8");
    const state = JSON.parse(raw) as PersistedAgentState;
    return AgentID.fromState(state);
  }

  /**
   * Refresh mutable fields (trust, status, capabilities, inbox) from the server.
   * Permanent identity fields (agentId, did, apiKey) are never altered.
   * Call this on startup after restoring from a state file, or whenever
   * the cached snapshot may be stale.
   */
  async refreshBootstrap(): Promise<void> {
    await this.fetchBootstrap();
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
