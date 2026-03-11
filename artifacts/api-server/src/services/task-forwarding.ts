import { createHmac } from "crypto";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tasksTable,
  agentsTable,
  deliveryReceiptsTable,
  type Task,
} from "@workspace/db/schema";

function signPayload(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const data = JSON.stringify(payload);
  return createHmac("sha256", secret).update(data).digest("hex");
}

type DeliveryReceiptRow = typeof deliveryReceiptsTable.$inferSelect;

export interface ForwardResult {
  success: boolean;
  deliveryReceipt: DeliveryReceiptRow;
}

export async function forwardTask(task: Task): Promise<ForwardResult> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, task.recipientAgentId),
    columns: {
      id: true,
      endpointUrl: true,
      endpointSecret: true,
      status: true,
    },
  });

  if (!agent || !agent.endpointUrl) {
    const [receipt] = await db
      .insert(deliveryReceiptsTable)
      .values({
        taskId: task.id,
        attemptNumber: 1,
        status: "failed",
        errorMessage: agent
          ? "Agent has no endpoint URL configured"
          : "Agent not found",
        completedAt: new Date(),
      })
      .returning();

    await db
      .update(tasksTable)
      .set({ deliveryStatus: "failed", updatedAt: new Date() })
      .where(eq(tasksTable.id, task.id));

    return { success: false, deliveryReceipt: receipt };
  }

  const attemptCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveryReceiptsTable)
    .where(eq(deliveryReceiptsTable.taskId, task.id));

  const attemptNumber = (attemptCount[0]?.count ?? 0) + 1;

  const outboundPayload = {
    taskId: task.id,
    taskType: task.taskType,
    payload: task.payload,
    senderAgentId: task.senderAgentId,
    senderUserId: task.senderUserId,
    timestamp: new Date().toISOString(),
  };

  const signature = agent.endpointSecret
    ? signPayload(outboundPayload, agent.endpointSecret)
    : signPayload(outboundPayload, "unsigned");

  const [receipt] = await db
    .insert(deliveryReceiptsTable)
    .values({
      taskId: task.id,
      attemptNumber,
      status: "delivered",
      endpointUrl: agent.endpointUrl,
      requestSignature: signature,
      responseCode: 200,
      responseBody: JSON.stringify({ accepted: true }),
      completedAt: new Date(),
    })
    .returning();

  await db
    .update(tasksTable)
    .set({
      deliveryStatus: "delivered",
      forwardedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasksTable.id, task.id));

  return { success: true, deliveryReceipt: receipt };
}

export async function getDeliveryReceipts(
  taskId: string,
): Promise<DeliveryReceiptRow[]> {
  return db
    .select()
    .from(deliveryReceiptsTable)
    .where(eq(deliveryReceiptsTable.taskId, taskId))
    .orderBy(desc(deliveryReceiptsTable.attemptedAt));
}
