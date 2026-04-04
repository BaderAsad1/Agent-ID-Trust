import type { HttpClient } from "../utils/http.js";
import type {
  MailMessage,
  MailThread,
  InboxStats,
  SendMailOptions,
  ReplyMailOptions,
  ListThreadsOptions,
  ListMessagesOptions,
  MessageHandler,
  ErrorHandler,
} from "../types.js";

export class MailModule {
  private http: HttpClient;
  private agentId: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(http: HttpClient, agentId: string) {
    this.http = http;
    this.agentId = agentId;
  }

  async getInbox(): Promise<{ inbox: Record<string, unknown>; stats: InboxStats }> {
    return this.http.get(`/api/v1/mail/agents/${this.agentId}/inbox`);
  }

  async getStats(): Promise<InboxStats> {
    return this.http.get(`/api/v1/mail/agents/${this.agentId}/inbox/stats`);
  }

  async getThreads(options: ListThreadsOptions = {}): Promise<{ threads: MailThread[]; total: number }> {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    const qs = params.toString();
    return this.http.get(`/api/v1/mail/agents/${this.agentId}/threads${qs ? `?${qs}` : ""}`);
  }

  async getThread(threadId: string): Promise<{ thread: MailThread }> {
    return this.http.get(`/api/v1/mail/agents/${this.agentId}/threads/${threadId}`);
  }

  async send(options: SendMailOptions): Promise<{ message: MailMessage }> {
    return this.http.post(`/api/v1/mail/agents/${this.agentId}/messages`, {
      direction: "outbound",
      senderType: "agent",
      senderAgentId: this.agentId,
      recipientAddress: options.to,
      subject: options.subject,
      body: options.body,
      bodyFormat: options.bodyFormat || "text",
      structuredPayload: options.structuredPayload,
      priority: options.priority || "normal",
      metadata: options.metadata,
    });
  }

  async reply(options: ReplyMailOptions): Promise<{ message: MailMessage }> {
    return this.http.post(
      `/api/v1/mail/agents/${this.agentId}/threads/${options.threadId}/reply`,
      {
        body: options.body,
        bodyFormat: options.bodyFormat || "text",
        structuredPayload: options.structuredPayload,
        metadata: options.metadata,
      },
    );
  }

  async markRead(messageId: string, isRead = true): Promise<{ message: MailMessage }> {
    return this.http.post(`/api/v1/mail/agents/${this.agentId}/messages/${messageId}/read`, {
      isRead,
    });
  }

  async archive(threadId: string): Promise<{ thread: MailThread }> {
    return this.http.patch(`/api/v1/mail/agents/${this.agentId}/threads/${threadId}`, {
      status: "archived",
    });
  }

  async convertToTask(messageId: string): Promise<Record<string, unknown>> {
    return this.http.post(
      `/api/v1/mail/agents/${this.agentId}/messages/${messageId}/convert-task`,
    );
  }

  async getMessages(options: ListMessagesOptions = {}): Promise<{ messages: MailMessage[]; total: number }> {
    const params = new URLSearchParams();
    if (options.threadId) params.set("threadId", options.threadId);
    if (options.direction) params.set("direction", options.direction);
    if (options.isRead !== undefined) params.set("isRead", String(options.isRead));
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    const qs = params.toString();
    return this.http.get(`/api/v1/mail/agents/${this.agentId}/messages${qs ? `?${qs}` : ""}`);
  }

  onMessage(handler: MessageHandler, intervalMs = 10000, onError?: ErrorHandler): () => void {
    let lastSeen: string | null = null;

    const poll = async () => {
      try {
        const result = await this.getMessages({ direction: "inbound", isRead: false, limit: 50 });
        const messages = result.messages || [];

        for (const msg of messages) {
          if (lastSeen && msg.createdAt <= lastSeen) continue;
          await handler(msg);
        }

        if (messages.length > 0) {
          lastSeen = messages[messages.length - 1].createdAt;
        }
      } catch (err) {
        if (onError) onError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    poll();
    this.pollTimer = setInterval(poll, intervalMs);

    return () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    };
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
