import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tasksTable,
  agentsTable,
  type Task,
} from "@workspace/db/schema";

export interface SubmitTaskInput {
  recipientAgentId: string;
  senderUserId?: string;
  senderAgentId?: string;
  taskType: string;
  payload?: Record<string, unknown>;
  relatedOrderId?: string;
}

export interface TaskListFilters {
  recipientAgentId?: string;
  recipientAgentIds?: string[];
  senderUserId?: string;
  senderAgentId?: string;
  deliveryStatus?: string;
  businessStatus?: string;
  limit?: number;
  offset?: number;
}

export async function submitTask(input: SubmitTaskInput): Promise<Task> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(
      eq(agentsTable.id, input.recipientAgentId),
      eq(agentsTable.status, "active"),
    ),
    columns: { id: true, userId: true },
  });

  if (!agent) {
    throw new Error("RECIPIENT_NOT_FOUND");
  }

  if (!input.senderUserId && !input.senderAgentId) {
    throw new Error("SENDER_REQUIRED");
  }

  if (input.senderAgentId === input.recipientAgentId) {
    throw new Error("SELF_TASK_NOT_ALLOWED");
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      recipientAgentId: input.recipientAgentId,
      senderUserId: input.senderUserId,
      senderAgentId: input.senderAgentId,
      taskType: input.taskType,
      payload: input.payload,
      relatedOrderId: input.relatedOrderId,
      deliveryStatus: "pending",
      businessStatus: "pending",
    })
    .returning();

  await db
    .update(agentsTable)
    .set({
      tasksReceived: sql`${agentsTable.tasksReceived} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, input.recipientAgentId));

  return task;
}

export async function getTaskById(taskId: string): Promise<Task | null> {
  const task = await db.query.tasksTable.findFirst({
    where: eq(tasksTable.id, taskId),
  });
  return task ?? null;
}

export async function listTasks(filters: TaskListFilters): Promise<{
  tasks: Task[];
  total: number;
}> {
  const conditions = [];

  if (filters.recipientAgentId) {
    conditions.push(eq(tasksTable.recipientAgentId, filters.recipientAgentId));
  } else if (filters.senderAgentId) {
    conditions.push(eq(tasksTable.senderAgentId, filters.senderAgentId));
  } else if (filters.recipientAgentIds && filters.senderUserId) {
    const scopeConditions = [];
    if (filters.recipientAgentIds.length > 0) {
      scopeConditions.push(inArray(tasksTable.recipientAgentId, filters.recipientAgentIds));
    }
    scopeConditions.push(eq(tasksTable.senderUserId, filters.senderUserId));
    conditions.push(or(...scopeConditions)!);
  } else if (filters.senderUserId) {
    conditions.push(eq(tasksTable.senderUserId, filters.senderUserId));
  }

  if (filters.deliveryStatus) {
    conditions.push(
      eq(
        tasksTable.deliveryStatus,
        filters.deliveryStatus as Task["deliveryStatus"],
      ),
    );
  }
  if (filters.businessStatus) {
    conditions.push(
      eq(
        tasksTable.businessStatus,
        filters.businessStatus as Task["businessStatus"],
      ),
    );
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const [tasks, countResult] = await Promise.all([
    db.query.tasksTable.findMany({
      where: whereClause,
      orderBy: [desc(tasksTable.createdAt)],
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasksTable)
      .where(whereClause),
  ]);

  return { tasks, total: countResult[0].count };
}

export async function acknowledgeTask(
  taskId: string,
  agentOwnerId: string,
): Promise<Task | null> {
  const task = await getTaskById(taskId);
  if (!task) return null;

  const agent = await db.query.agentsTable.findFirst({
    where: and(
      eq(agentsTable.id, task.recipientAgentId),
      eq(agentsTable.userId, agentOwnerId),
    ),
    columns: { id: true },
  });

  if (!agent) return null;

  if (task.deliveryStatus === "acknowledged") {
    return task;
  }

  if (task.deliveryStatus !== "delivered") {
    throw new Error("INVALID_DELIVERY_STATE");
  }

  const [updated] = await db
    .update(tasksTable)
    .set({
      deliveryStatus: "acknowledged",
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasksTable.id, taskId))
    .returning();

  return updated ?? null;
}

const VALID_BUSINESS_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["completed", "failed", "cancelled"],
  rejected: [],
  completed: [],
  failed: [],
  cancelled: [],
};

export async function updateBusinessStatus(
  taskId: string,
  agentOwnerId: string,
  newStatus: string,
  result?: Record<string, unknown>,
): Promise<Task | null> {
  const task = await getTaskById(taskId);
  if (!task) return null;

  const agent = await db.query.agentsTable.findFirst({
    where: and(
      eq(agentsTable.id, task.recipientAgentId),
      eq(agentsTable.userId, agentOwnerId),
    ),
    columns: { id: true },
  });

  if (!agent) return null;

  const allowed = VALID_BUSINESS_TRANSITIONS[task.businessStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `INVALID_TRANSITION:${task.businessStatus}→${newStatus}`,
    );
  }

  const updates: Record<string, unknown> = {
    businessStatus: newStatus,
    respondedAt: new Date(),
    updatedAt: new Date(),
  };

  if (result) {
    updates.result = result;
  }

  const [updated] = await db
    .update(tasksTable)
    .set(updates)
    .where(eq(tasksTable.id, taskId))
    .returning();

  if (newStatus === "completed") {
    await db
      .update(agentsTable)
      .set({
        tasksCompleted: sql`${agentsTable.tasksCompleted} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, task.recipientAgentId));
  }

  return updated ?? null;
}

export async function getUserAgentIds(userId: string): Promise<string[]> {
  const agents = await db.query.agentsTable.findMany({
    where: eq(agentsTable.userId, userId),
    columns: { id: true },
  });
  return agents.map((a) => a.id);
}

export async function canAccessTask(
  taskId: string,
  userId: string,
): Promise<boolean> {
  const task = await getTaskById(taskId);
  if (!task) return false;

  const userAgents = await db.query.agentsTable.findMany({
    where: eq(agentsTable.userId, userId),
    columns: { id: true },
  });

  const agentIds = userAgents.map((a) => a.id);

  if (agentIds.includes(task.recipientAgentId)) return true;
  if (task.senderAgentId && agentIds.includes(task.senderAgentId)) return true;
  if (task.senderUserId === userId) return true;

  return false;
}
