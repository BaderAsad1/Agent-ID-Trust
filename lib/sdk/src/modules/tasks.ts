import type { HttpClient } from "../utils/http.js";
import type {
  Task,
  ListTasksOptions,
  SendTaskOptions,
  TaskHandler,
} from "../types.js";

export class TaskModule {
  private http: HttpClient;
  private agentId: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(http: HttpClient, agentId: string) {
    this.http = http;
    this.agentId = agentId;
  }

  async list(options: ListTasksOptions = {}): Promise<{ tasks: Task[]; total: number }> {
    const params = new URLSearchParams();
    params.set("recipientAgentId", this.agentId);
    if (options.deliveryStatus) params.set("deliveryStatus", options.deliveryStatus);
    if (options.businessStatus) params.set("businessStatus", options.businessStatus);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    const qs = params.toString();
    return this.http.get(`/api/v1/tasks?${qs}`);
  }

  async get(taskId: string): Promise<Task> {
    return this.http.get(`/api/v1/tasks/${taskId}`);
  }

  async acknowledge(taskId: string): Promise<Task> {
    return this.http.post(`/api/v1/tasks/${taskId}/acknowledge`);
  }

  async complete(taskId: string, result?: Record<string, unknown>): Promise<Task> {
    return this.http.patch(`/api/v1/tasks/${taskId}/business-status`, {
      status: "completed",
      result,
    });
  }

  async fail(taskId: string, result?: Record<string, unknown>): Promise<Task> {
    return this.http.post(`/api/v1/tasks/${taskId}/fail`, {
      result,
    });
  }

  async accept(taskId: string): Promise<Task> {
    return this.http.post(`/api/v1/tasks/${taskId}/accept`);
  }

  async start(taskId: string): Promise<Task> {
    return this.http.post(`/api/v1/tasks/${taskId}/start`);
  }

  async reject(taskId: string, result?: Record<string, unknown>): Promise<Task> {
    return this.http.post(`/api/v1/tasks/${taskId}/reject`, { result });
  }

  async send(options: SendTaskOptions): Promise<{ task: Task }> {
    return this.http.post("/api/v1/tasks", {
      senderAgentId: this.agentId,
      recipientAgentId: options.recipientAgentId,
      taskType: options.taskType,
      payload: options.payload,
    });
  }

  onTask(handler: TaskHandler, intervalMs = 10000): () => void {
    const seen = new Set<string>();

    const poll = async () => {
      try {
        const result = await this.list({ businessStatus: "pending", limit: 50 });
        const tasks = result.tasks || [];

        for (const task of tasks) {
          if (seen.has(task.id)) continue;
          seen.add(task.id);
          await handler(task);
        }
      } catch {
        // silently retry on next interval
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
