import { eq, and, desc, or, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentTransfersTable,
  agentTransferEventsTable,
  agentTransferAssetsTable,
  agentsTable,
  agentKeysTable,
  type AgentTransfer,
} from "@workspace/db/schema";
import { snapshotTrustState, recalibrateTrust } from "./trust-recalibration";
import { recordOperatorChange } from "./operator-history";
import { logActivity } from "./activity-logger";
import { generateReadinessReport } from "./transfer-readiness";

type TransferStatus = AgentTransfer["status"];

const VALID_TRANSITIONS: Record<string, TransferStatus[]> = {
  draft: ["pending_acceptance", "cancelled"],
  pending_acceptance: ["transfer_pending", "cancelled"],
  transfer_pending: ["in_handoff", "cancelled", "disputed"],
  in_handoff: ["completed", "disputed", "cancelled"],
  completed: [],
  disputed: ["cancelled", "in_handoff"],
  cancelled: [],
};

function validateTransition(current: TransferStatus, next: TransferStatus): boolean {
  return (VALID_TRANSITIONS[current] || []).includes(next);
}

async function appendTransferEvent(
  transferId: string,
  eventType: string,
  fromStatus: string | null,
  toStatus: string | null,
  actorId?: string,
  actorType?: string,
  payload?: Record<string, unknown>,
) {
  await db.insert(agentTransferEventsTable).values({
    transferId,
    eventType,
    fromStatus,
    toStatus,
    actorId,
    actorType: actorType || "user",
    payload,
  });
}

export interface CreateTransferInput {
  agentId: string;
  sellerId: string;
  buyerId?: string;
  transferType: "private_transfer" | "internal_reassignment";
  askingPrice?: number;
  currency?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export async function createTransfer(input: CreateTransferInput): Promise<AgentTransfer> {
  const agent = await db.query.agentsTable.findFirst({
    where: and(
      eq(agentsTable.id, input.agentId),
      // Effective-owner: ownerUserId takes precedence over userId (original creator)
      or(
        eq(agentsTable.ownerUserId, input.sellerId),
        and(isNull(agentsTable.ownerUserId), eq(agentsTable.userId, input.sellerId)),
      ),
    ),
  });

  if (!agent) {
    throw new Error("Agent not found or you do not own it");
  }

  const readiness = await generateReadinessReport(input.agentId);
  if (!readiness.isReady) {
    throw new Error(`Agent is not ready for transfer: ${readiness.blockers.map(b => b.message).join(", ")}`);
  }

  const [transfer] = await db
    .insert(agentTransfersTable)
    .values({
      agentId: input.agentId,
      sellerId: input.sellerId,
      buyerId: input.buyerId,
      transferType: input.transferType,
      askingPrice: input.askingPrice,
      currency: input.currency || "USD",
      notes: input.notes,
      metadata: input.metadata,
      status: "draft",
    })
    .returning();

  const assets = await generateReadinessReport(input.agentId);
  const allAssets = [
    ...assets.assets.transferable,
    ...assets.assets.buyer_must_reconnect,
    ...assets.assets.excluded_by_default,
  ];

  for (const asset of allAssets) {
    await db.insert(agentTransferAssetsTable).values({
      transferId: transfer.id,
      assetName: asset.name,
      assetCategory: asset.category,
      description: asset.description,
    });
  }

  await appendTransferEvent(transfer.id, "transfer.created", null, "draft", input.sellerId, "user", {
    agentId: input.agentId,
    transferType: input.transferType,
  });

  await logActivity({
    agentId: input.agentId,
    eventType: "transfer.created",
    payload: { transferId: transfer.id, transferType: input.transferType },
  });

  return transfer;
}

export async function getTransfer(transferId: string): Promise<AgentTransfer | null> {
  const transfer = await db.query.agentTransfersTable.findFirst({
    where: eq(agentTransfersTable.id, transferId),
  });
  return transfer ?? null;
}

export async function listAgentTransfers(agentId: string): Promise<AgentTransfer[]> {
  return db.query.agentTransfersTable.findMany({
    where: eq(agentTransfersTable.agentId, agentId),
    orderBy: [desc(agentTransfersTable.createdAt)],
  });
}

export interface UpdateTransferInput {
  askingPrice?: number;
  buyerId?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export async function updateTransfer(
  transferId: string,
  actorId: string,
  updates: UpdateTransferInput,
): Promise<AgentTransfer> {
  const transfer = await getTransfer(transferId);
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.sellerId !== actorId) throw new Error("Only the seller can update a transfer");
  if (transfer.status !== "draft" && transfer.status !== "listed") {
    throw new Error("Transfer can only be updated in draft or listed status");
  }

  const [updated] = await db
    .update(agentTransfersTable)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(agentTransfersTable.id, transferId))
    .returning();

  await appendTransferEvent(transferId, "transfer.updated", transfer.status, transfer.status, actorId, "user", updates as unknown as Record<string, unknown>);

  return updated;
}

export async function listTransfer(_transferId: string, _actorId: string): Promise<never> {
  // Public marketplace listing is not implemented. The /list route is disabled
  // (returns 501). This function fails explicitly so it cannot be accidentally
  // re-enabled without a real implementation behind it.
  throw new Error("LISTING_NOT_AVAILABLE: Public marketplace listing is not enabled. Enable the route and implement this function together.");
}

export async function acceptTransfer(
  transferId: string,
  buyerId: string,
  agreedPrice?: number,
): Promise<AgentTransfer> {
  const transfer = await getTransfer(transferId);
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.sellerId === buyerId) throw new Error("Seller cannot accept their own transfer");

  if (transfer.buyerId && transfer.buyerId !== buyerId) {
    throw new Error("This transfer is designated for a specific buyer");
  }

  if (!validateTransition(transfer.status, "pending_acceptance")) {
    throw new Error(`Cannot accept transfer in ${transfer.status} status`);
  }

  const [updated] = await db
    .update(agentTransfersTable)
    .set({
      status: "pending_acceptance",
      buyerId,
      agreedPrice: agreedPrice ?? transfer.askingPrice,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentTransfersTable.id, transferId))
    .returning();

  await appendTransferEvent(transferId, "transfer.accepted", transfer.status, "pending_acceptance", buyerId, "user", {
    agreedPrice: agreedPrice ?? transfer.askingPrice,
  });

  return updated;
}

export async function fundHold(_transferId: string, _actorId: string): Promise<never> {
  // Escrow integration is not implemented. The /fund-hold route is disabled
  // (returns 501) so this function should never be reached. If it is, we fail
  // explicitly rather than silently pretending funds are held.
  throw new Error("ESCROW_NOT_AVAILABLE: Real escrow integration is required before this path can be enabled. Do not simulate fund holds.");
}

export async function advanceToTransferPending(transferId: string, actorId: string): Promise<AgentTransfer> {
  const transfer = await getTransfer(transferId);
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.sellerId !== actorId) {
    throw new Error("Only the seller can advance the transfer");
  }
  if ((transfer.transferType as string) === "sale" && transfer.status !== "hold_pending") {
    throw new Error("Sale transfers must have hold funded before advancing to transfer_pending");
  }
  if (!validateTransition(transfer.status, "transfer_pending")) {
    throw new Error(`Cannot advance to transfer_pending from ${transfer.status} status`);
  }

  const [updated] = await db
    .update(agentTransfersTable)
    .set({ status: "transfer_pending", updatedAt: new Date() })
    .where(eq(agentTransfersTable.id, transferId))
    .returning();

  await appendTransferEvent(transferId, "transfer.advanced_to_pending", transfer.status, "transfer_pending", actorId, "user");

  return updated;
}

export async function startHandoff(transferId: string, actorId: string): Promise<AgentTransfer> {
  const transfer = await getTransfer(transferId);
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.sellerId !== actorId) {
    throw new Error("Only the seller can start the handoff");
  }
  if (!transfer.buyerId) {
    throw new Error("No buyer assigned to this transfer");
  }

  const canSkipHold = (transfer.transferType as string) !== "sale";

  if (canSkipHold && transfer.status === "pending_acceptance") {
    await db
      .update(agentTransfersTable)
      .set({ status: "transfer_pending", updatedAt: new Date() })
      .where(eq(agentTransfersTable.id, transferId));
    await appendTransferEvent(transferId, "transfer.status_advanced", "pending_acceptance", "transfer_pending", actorId, "user");
  }

  const currentStatus = canSkipHold && transfer.status === "pending_acceptance" ? "transfer_pending" : transfer.status;

  if (!validateTransition(currentStatus as TransferStatus, "in_handoff")) {
    throw new Error(`Cannot start handoff in ${transfer.status} status`);
  }

  await snapshotTrustState(transferId, transfer.agentId);

  await appendTransferEvent(transferId, "transfer.trust_snapshotted", currentStatus as string, currentStatus as string, actorId, "user", {
    agentId: transfer.agentId,
  });

  await logActivity({
    agentId: transfer.agentId,
    eventType: "transfer.trust_snapshotted",
    payload: { transferId },
  });

  const [updated] = await db
    .update(agentTransfersTable)
    .set({
      status: "in_handoff",
      handoffStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentTransfersTable.id, transferId))
    .returning();

  await appendTransferEvent(transferId, "transfer.handoff_started", currentStatus as string, "in_handoff", actorId, "user");

  await logActivity({
    agentId: transfer.agentId,
    eventType: "transfer.handoff_started",
    payload: { transferId },
  });

  return updated;
}

export async function completeHandoff(transferId: string, actorId: string): Promise<AgentTransfer> {
  const transfer = await getTransfer(transferId);
  if (!transfer) throw new Error("Transfer not found");
  if (!transfer.buyerId) throw new Error("No buyer assigned to this transfer");
  if (transfer.sellerId !== actorId) {
    throw new Error("Only the seller can complete the handoff");
  }
  if (!validateTransition(transfer.status, "completed")) {
    throw new Error(`Cannot complete handoff in ${transfer.status} status`);
  }

  const buyerId = transfer.buyerId;

  const result = await db.transaction(async (tx) => {
    const activeKeys = await tx.query.agentKeysTable.findMany({
      where: and(
        eq(agentKeysTable.agentId, transfer.agentId),
        eq(agentKeysTable.status, "active"),
      ),
    });

    for (const key of activeKeys) {
      await tx
        .update(agentKeysTable)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(eq(agentKeysTable.id, key.id));
    }

    await tx.insert(agentTransferEventsTable).values({
      transferId, eventType: "transfer.keys_rotated",
      fromStatus: "in_handoff", toStatus: "in_handoff",
      actorId, actorType: "user",
      payload: { revokedKeyCount: activeKeys.length, revokedKeyIds: activeKeys.map(k => k.id) },
    });

    await tx
      .update(agentsTable)
      .set({
        userId: buyerId,
        transferStatus: "completed",
        transferredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, transfer.agentId));

    const [updated] = await tx
      .update(agentTransfersTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentTransfersTable.id, transferId))
      .returning();

    await tx.insert(agentTransferEventsTable).values({
      transferId, eventType: "transfer.handoff_completed",
      fromStatus: "in_handoff", toStatus: "completed",
      actorId, actorType: "user",
      payload: { revokedKeys: activeKeys.length },
    });

    return { updated, activeKeys };
  });

  const recalibration = await recalibrateTrust(
    transferId,
    transfer.agentId,
    buyerId,
    transfer.transferType,
  );

  await appendTransferEvent(transferId, "transfer.trust_recalibrated", "completed", "completed", actorId, "user", {
    surfaces: recalibration.surfaces,
    adjustmentFactor: recalibration.transferAdjustmentFactor,
    continuityQualityScore: recalibration.continuityQualityScore,
  });

  await recordOperatorChange({
    agentId: transfer.agentId,
    newOperatorId: buyerId,
    transferId,
  });

  await appendTransferEvent(transferId, "transfer.operator_changed", "completed", "completed", actorId, "user", {
    fromOperator: transfer.sellerId,
    toOperator: buyerId,
  });

  await logActivity({
    agentId: transfer.agentId,
    eventType: "transfer.handoff_completed",
    payload: {
      transferId,
      newOwner: buyerId,
      revokedKeyCount: result.activeKeys.length,
      trustSurfaces: recalibration.surfaces,
    },
  });

  try {
    const { reissueCredential } = await import("./credentials");
    await reissueCredential(transfer.agentId);
  } catch {}

  try {
    const { clearVcCache } = await import("./verifiable-credential");
    clearVcCache(transfer.agentId);
  } catch {}

  try {
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, transfer.agentId),
      columns: { handle: true },
    });
    if (agent?.handle) {
      const { deleteResolutionCache } = await import("../lib/resolution-cache");
      await deleteResolutionCache(agent.handle.toLowerCase());
    }
  } catch {}

  return result.updated;
}

export async function cancelTransfer(transferId: string, actorId: string, reason?: string): Promise<AgentTransfer> {
  const transfer = await getTransfer(transferId);
  if (!transfer) throw new Error("Transfer not found");
  if (!validateTransition(transfer.status, "cancelled")) {
    throw new Error(`Cannot cancel transfer in ${transfer.status} status`);
  }
  if (transfer.sellerId !== actorId && transfer.buyerId !== actorId) {
    throw new Error("Only the seller or buyer can cancel a transfer");
  }

  const [updated] = await db
    .update(agentTransfersTable)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentTransfersTable.id, transferId))
    .returning();

  await appendTransferEvent(transferId, "transfer.cancelled", transfer.status, "cancelled", actorId, "user", { reason });

  await logActivity({
    agentId: transfer.agentId,
    eventType: "transfer.cancelled",
    payload: { transferId, reason },
  });

  return updated;
}

export async function disputeTransfer(transferId: string, actorId: string, reason: string): Promise<AgentTransfer> {
  const transfer = await getTransfer(transferId);
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.sellerId !== actorId && transfer.buyerId !== actorId) {
    throw new Error("Only the seller or buyer can dispute a transfer");
  }
  if (!validateTransition(transfer.status, "disputed")) {
    throw new Error(`Cannot dispute transfer in ${transfer.status} status`);
  }

  const [updated] = await db
    .update(agentTransfersTable)
    .set({
      status: "disputed",
      disputedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentTransfersTable.id, transferId))
    .returning();

  await appendTransferEvent(transferId, "transfer.dispute_raised", transfer.status, "disputed", actorId, "user", { reason });

  await logActivity({
    agentId: transfer.agentId,
    eventType: "transfer.dispute_raised",
    payload: { transferId, reason },
  });

  return updated;
}

export async function reconnectAsset(assetId: string, transferId: string) {
  const asset = await db.query.agentTransferAssetsTable.findFirst({
    where: and(
      eq(agentTransferAssetsTable.id, assetId),
      eq(agentTransferAssetsTable.transferId, transferId),
    ),
  });

  if (!asset) {
    throw new Error("Asset not found for this transfer");
  }

  if (asset.assetCategory !== "buyer_must_reconnect") {
    throw new Error("Only buyer_must_reconnect assets can be reconnected");
  }

  if (asset.reconnectedAt) {
    throw new Error("Asset has already been reconnected");
  }

  const [updated] = await db
    .update(agentTransferAssetsTable)
    .set({ reconnectedAt: new Date() })
    .where(eq(agentTransferAssetsTable.id, assetId))
    .returning();

  await appendTransferEvent(transferId, "transfer.asset_reconnected", null, null, undefined, "system", {
    assetId: asset.id,
    assetName: asset.assetName,
  });

  return updated;
}

export async function getTransferEvents(transferId: string) {
  return db.query.agentTransferEventsTable.findMany({
    where: eq(agentTransferEventsTable.transferId, transferId),
    orderBy: [desc(agentTransferEventsTable.createdAt)],
  });
}

export async function getTransferAssets(transferId: string) {
  return db.query.agentTransferAssetsTable.findMany({
    where: eq(agentTransferAssetsTable.transferId, transferId),
  });
}
