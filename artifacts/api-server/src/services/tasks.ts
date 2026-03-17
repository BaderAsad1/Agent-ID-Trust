import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
import { logger } from "../middlewares/request-logger";
import { db } from "@workspace/db";
import {
  tasksTable,
  agentsTable,
  agentLineageTable,
  usersTable,
  type Task,
} from "@workspace/db/schema";

function hasEmailNotificationsEnabled(agentMetadata: unknown): boolean {
  if (
    agentMetadata &&
    typeof agentMetadata === "object" &&
    "emailNotificationsEnabled" in agentMetadata &&
    (agentMetadata as Record<string, unknown>).emailNotificationsEnabled === false
  ) {
    return false;
  }
  return true;
}

export interface SubmitTaskInput {
  recipientAgentId: string;
  senderUserId?: string;
  senderAgentId?: string;
  taskType: string;
  payload?: Record<string, unknown>;
  relatedOrderId?: string;
  idempotencyKey?: string;
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


  const [task] = await db
    .insert(tasksTable)
    .values({
      recipientAgentId: input.recipientAgentId,
      senderUserId: input.senderUserId,
      senderAgentId: input.senderAgentId,
      taskType: input.taskType,
      payload: input.payload,
      relatedOrderId: input.relatedOrderId,
      idempotencyKey: input.idempotencyKey,
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

  try {
    const recipientAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, input.recipientAgentId),
      columns: { handle: true, displayName: true, userId: true, metadata: true },
    });
    if (recipientAgent) {
      const emailNotificationsEnabled = hasEmailNotificationsEnabled(recipientAgent.metadata);
      const owner = emailNotificationsEnabled
        ? await db.query.usersTable.findFirst({
            where: eq(usersTable.id, recipientAgent.userId),
            columns: { email: true },
          })
        : null;
      if (owner?.email) {
        const { sendNewTaskEmail } = await import("./email.js");
        await sendNewTaskEmail(
          owner.email,
          recipientAgent.handle ?? "",
          recipientAgent.displayName,
          input.taskType,
          task.id,
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "[tasks] Failed to send new task email");
  }

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
  accepted: ["in_progress", "completed", "failed", "cancelled"],
  in_progress: ["completed", "failed", "cancelled"],
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

  if (newStatus === "completed") {
    const isSelfTask = task.senderAgentId != null && task.senderAgentId === task.recipientAgentId;
    let isLineageTask = false;
    if (!isSelfTask && task.senderAgentId) {
      const lineageRows = await db
        .select({ id: agentLineageTable.agentId })
        .from(agentLineageTable)
        .where(
          and(
            eq(agentLineageTable.agentId, task.senderAgentId),
            eq(agentLineageTable.ancestorId, task.recipientAgentId),
          ),
        )
        .limit(1);
      if (lineageRows.length === 0) {
        const reverseRows = await db
          .select({ id: agentLineageTable.agentId })
          .from(agentLineageTable)
          .where(
            and(
              eq(agentLineageTable.agentId, task.recipientAgentId),
              eq(agentLineageTable.ancestorId, task.senderAgentId),
            ),
          )
          .limit(1);
        isLineageTask = reverseRows.length > 0;
      } else {
        isLineageTask = true;
      }
    }
    const trustCreditEligible = !isSelfTask && !isLineageTask;
    updates.trustCreditEligible = trustCreditEligible;
    updates.completedAt = new Date();

    const [updated] = await db
      .update(tasksTable)
      .set(updates)
      .where(eq(tasksTable.id, taskId))
      .returning();

    if (trustCreditEligible) {
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

  const [updated] = await db
    .update(tasksTable)
    .set(updates)
    .where(eq(tasksTable.id, taskId))
    .returning();

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
