import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentOperatorHistoryTable,
  agentsTable,
  usersTable,
} from "@workspace/db/schema";

export interface RecordOperatorChangeInput {
  agentId: string;
  newOperatorId: string;
  transferId?: string;
  metadata?: Record<string, unknown>;
}

export async function recordOperatorChange(input: RecordOperatorChangeInput) {
  const now = new Date();

  const previousRecords = await db
    .select()
    .from(agentOperatorHistoryTable)
    .where(
      and(
        eq(agentOperatorHistoryTable.agentId, input.agentId),
        isNull(agentOperatorHistoryTable.effectiveTo),
      ),
    );

  for (const record of previousRecords) {
    await db
      .update(agentOperatorHistoryTable)
      .set({ effectiveTo: now })
      .where(eq(agentOperatorHistoryTable.id, record.id));
  }

  const newOperator = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, input.newOperatorId),
  });

  const ownedAgents = await db.query.agentsTable.findMany({
    where: eq(agentsTable.userId, input.newOperatorId),
    columns: { verificationStatus: true },
  });
  const hasVerifiedAgent = ownedAgents.some(a => a.verificationStatus === "verified");
  const operatorVerificationStatus = hasVerifiedAgent ? "verified" : (newOperator ? "registered" : "unknown");

  const [entry] = await db
    .insert(agentOperatorHistoryTable)
    .values({
      agentId: input.agentId,
      operatorId: input.newOperatorId,
      transferId: input.transferId,
      operatorHandle: newOperator?.username || null,
      verificationStatus: operatorVerificationStatus,
      effectiveFrom: now,
      metadata: input.metadata,
    })
    .returning();

  return entry;
}

export async function getOperatorHistory(agentId: string) {
  return db.query.agentOperatorHistoryTable.findMany({
    where: eq(agentOperatorHistoryTable.agentId, agentId),
    orderBy: [desc(agentOperatorHistoryTable.effectiveFrom)],
  });
}

export async function getOperatorCount(agentId: string): Promise<number> {
  const history = await db
    .select()
    .from(agentOperatorHistoryTable)
    .where(eq(agentOperatorHistoryTable.agentId, agentId));
  return history.length;
}

export async function getCurrentOperator(agentId: string) {
  return db.query.agentOperatorHistoryTable.findFirst({
    where: and(
      eq(agentOperatorHistoryTable.agentId, agentId),
      isNull(agentOperatorHistoryTable.effectiveTo),
    ),
    orderBy: [desc(agentOperatorHistoryTable.effectiveFrom)],
  });
}
