import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentTransferSnapshotsTable,
  agentTransferAssetsTable,
  usersTable,
} from "@workspace/db/schema";
import { computeTrustScore } from "./trust-score";

const PROBATION_PERIOD_DAYS = 90;

const TRANSFER_TYPE_PENALTY: Record<string, number> = {
  internal_reassignment: 0.05,
  private_transfer: 0.15,
  sale: 0.25,
};

export interface TrustSurfaces {
  historical_agent_reputation: number;
  current_operator_reputation: number;
  effective_live_trust: number;
}

export interface TrustRecalibrationResult {
  snapshotId: string;
  surfaces: TrustSurfaces;
  transferAdjustmentFactor: number;
  continuityQualityScore: number;
}

export async function snapshotTrustState(
  transferId: string,
  agentId: string,
): Promise<string> {
  const { trustScore, trustTier, trustBreakdown } = await computeTrustScore(agentId);

  const [snapshot] = await db
    .insert(agentTransferSnapshotsTable)
    .values({
      transferId,
      agentId,
      preTransferTrustScore: trustScore,
      preTransferTrustTier: trustTier,
      preTransferTrustBreakdown: trustBreakdown,
      historicalAgentReputation: trustScore,
      currentOperatorReputation: 0,
      effectiveLiveTrust: trustScore,
    })
    .returning();

  return snapshot.id;
}

function computeContinuityQuality(transferId: string, assets: Array<{ assetCategory: string; reconnectedAt: Date | null }>): number {
  const reconnectItems = assets.filter(a => a.assetCategory === "buyer_must_reconnect");
  if (reconnectItems.length === 0) return 1.0;

  const reconnected = reconnectItems.filter(a => a.reconnectedAt !== null).length;
  return reconnected / reconnectItems.length;
}

async function computeOperatorReputation(operatorId: string): Promise<number> {
  const operator = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, operatorId),
  });

  if (!operator) return 0;

  let score = 10;

  if (operator.username) score += 5;
  if (operator.email) score += 5;

  const ageMs = Date.now() - new Date(operator.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays >= 365) score += 20;
  else if (ageDays >= 180) score += 15;
  else if (ageDays >= 90) score += 10;
  else if (ageDays >= 30) score += 5;

  const ownedAgents = await db.query.agentsTable.findMany({
    where: eq(agentsTable.userId, operatorId),
    columns: { id: true, verificationStatus: true, trustScore: true },
  });

  if (ownedAgents.length > 0) {
    score += Math.min(ownedAgents.length * 3, 15);
    const verifiedCount = ownedAgents.filter(a => a.verificationStatus === "verified").length;
    score += verifiedCount * 5;
  }

  return Math.min(score, 100);
}

function computeProbationDecay(daysSinceTransfer: number): number {
  if (daysSinceTransfer >= PROBATION_PERIOD_DAYS) return 0;
  return 1 - (daysSinceTransfer / PROBATION_PERIOD_DAYS);
}

export async function recalibrateTrust(
  transferId: string,
  agentId: string,
  newOperatorId: string,
  transferType: string,
): Promise<TrustRecalibrationResult> {
  const snapshot = await db.query.agentTransferSnapshotsTable.findFirst({
    where: eq(agentTransferSnapshotsTable.transferId, transferId),
  });

  if (!snapshot) {
    throw new Error(`No trust snapshot found for transfer ${transferId}`);
  }

  const assets = await db.query.agentTransferAssetsTable.findMany({
    where: eq(agentTransferAssetsTable.transferId, transferId),
  });

  const historicalAgentReputation = snapshot.preTransferTrustScore;
  const currentOperatorReputation = await computeOperatorReputation(newOperatorId);
  const continuityQualityScore = computeContinuityQuality(transferId, assets);

  const snapshotCreatedAt = new Date(snapshot.createdAt);
  const daysSinceTransfer = (Date.now() - snapshotCreatedAt.getTime()) / (1000 * 60 * 60 * 24);

  const typePenalty = TRANSFER_TYPE_PENALTY[transferType] ?? 0.25;
  const continuityBonus = continuityQualityScore * 0.15;
  const probationPenalty = computeProbationDecay(daysSinceTransfer);

  const transferAdjustmentFactor = Math.max(0, 1 - typePenalty + continuityBonus - (probationPenalty * 0.1));

  const blendedBase = (historicalAgentReputation * 0.4) + (currentOperatorReputation * 0.3);
  const effectiveLiveTrust = Math.round(blendedBase * transferAdjustmentFactor);

  await db
    .update(agentTransferSnapshotsTable)
    .set({
      historicalAgentReputation,
      currentOperatorReputation,
      effectiveLiveTrust,
      transferAdjustmentFactor,
      continuityQualityScore,
    })
    .where(eq(agentTransferSnapshotsTable.id, snapshot.id));

  await db
    .update(agentsTable)
    .set({
      historicalAgentReputation: historicalAgentReputation,
      currentOperatorReputation: currentOperatorReputation,
      effectiveLiveTrust: effectiveLiveTrust,
      trustScore: effectiveLiveTrust,
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, agentId));

  return {
    snapshotId: snapshot.id,
    surfaces: {
      historical_agent_reputation: historicalAgentReputation,
      current_operator_reputation: currentOperatorReputation,
      effective_live_trust: effectiveLiveTrust,
    },
    transferAdjustmentFactor,
    continuityQualityScore,
  };
}
