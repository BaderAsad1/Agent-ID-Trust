import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  jobProposalsTable,
  jobPostsTable,
  agentsTable,
  marketplaceListingsTable,
  marketplaceOrdersTable,
  type JobProposal,
} from "@workspace/db/schema";
import { logActivity } from "./activity-logger";
import { incrementProposalsCount } from "./jobs";
import { createOrder } from "./orders";
import { submitTask } from "./tasks";
import { calculatePlatformFee } from "./marketplace";

export interface CreateProposalInput {
  jobId: string;
  agentId: string;
  userId: string;
  approach?: string;
  priceAmount?: string;
  deliveryHours?: number;
}

export async function createProposal(
  input: CreateProposalInput,
): Promise<{ success: boolean; proposal?: JobProposal; error?: string }> {
  const job = await db.query.jobPostsTable.findFirst({
    where: eq(jobPostsTable.id, input.jobId),
  });

  if (!job) return { success: false, error: "JOB_NOT_FOUND" };
  if (job.status !== "open") return { success: false, error: "JOB_NOT_OPEN" };
  if (job.posterUserId === input.userId) {
    return { success: false, error: "CANNOT_PROPOSE_OWN_JOB" };
  }

  const agent = await db.query.agentsTable.findFirst({
    where: and(
      eq(agentsTable.id, input.agentId),
      eq(agentsTable.userId, input.userId),
    ),
  });

  if (!agent) return { success: false, error: "AGENT_NOT_FOUND" };
  if (agent.status !== "active") {
    return { success: false, error: "AGENT_NOT_ACTIVE" };
  }

  if (job.verifiedOnly && agent.verificationStatus !== "verified") {
    return { success: false, error: "VERIFIED_ONLY" };
  }

  if (job.minTrustScore && agent.trustScore < job.minTrustScore) {
    return {
      success: false,
      error: `TRUST_SCORE_TOO_LOW:${agent.trustScore}<${job.minTrustScore}`,
    };
  }

  if (job.requiredCapabilities && (job.requiredCapabilities as string[]).length > 0) {
    const agentCaps = (agent.capabilities as string[]) ?? [];
    const missing = (job.requiredCapabilities as string[]).filter(
      (c) => !agentCaps.includes(c),
    );
    if (missing.length > 0) {
      return { success: false, error: `MISSING_CAPABILITIES:${missing.join(",")}` };
    }
  }

  const existing = await db.query.jobProposalsTable.findFirst({
    where: and(
      eq(jobProposalsTable.jobId, input.jobId),
      eq(jobProposalsTable.agentId, input.agentId),
    ),
  });
  if (existing) {
    return { success: false, error: "DUPLICATE_PROPOSAL" };
  }

  const [proposal] = await db
    .insert(jobProposalsTable)
    .values({
      jobId: input.jobId,
      agentId: input.agentId,
      userId: input.userId,
      approach: input.approach,
      priceAmount: input.priceAmount,
      deliveryHours: input.deliveryHours,
      status: "pending",
    })
    .returning();

  await incrementProposalsCount(input.jobId);

  await logActivity({
    agentId: input.agentId,
    eventType: "agent.proposal_submitted",
    payload: {
      proposalId: proposal.id,
      jobId: input.jobId,
      jobTitle: job.title,
    },
  });

  return { success: true, proposal };
}

export async function updateProposalStatus(
  jobId: string,
  proposalId: string,
  posterUserId: string,
  newStatus: "accepted" | "rejected",
): Promise<{ success: boolean; proposal?: JobProposal; error?: string }> {
  const job = await db.query.jobPostsTable.findFirst({
    where: and(
      eq(jobPostsTable.id, jobId),
      eq(jobPostsTable.posterUserId, posterUserId),
    ),
  });

  if (!job) return { success: false, error: "JOB_NOT_FOUND" };
  if (job.status !== "open") {
    return { success: false, error: `JOB_NOT_OPEN:${job.status}` };
  }

  const proposal = await db.query.jobProposalsTable.findFirst({
    where: and(
      eq(jobProposalsTable.id, proposalId),
      eq(jobProposalsTable.jobId, jobId),
    ),
  });

  if (!proposal) return { success: false, error: "PROPOSAL_NOT_FOUND" };
  if (proposal.status !== "pending") {
    return { success: false, error: `INVALID_STATUS:${proposal.status}` };
  }

  if (newStatus === "accepted") {
    const priceAmount = proposal.priceAmount
      ? Number(proposal.priceAmount)
      : Number(job.budgetFixed ?? job.budgetMax ?? job.budgetMin ?? 0);

    const result = await db.transaction(async (tx) => {
      const [accepted] = await tx
        .update(jobProposalsTable)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(jobProposalsTable.id, proposalId))
        .returning();

      let linkedTaskId: string | undefined;
      let linkedOrderId: string | undefined;

      const activeListing = await tx.query.marketplaceListingsTable.findFirst({
        where: and(
          eq(marketplaceListingsTable.agentId, proposal.agentId),
          eq(marketplaceListingsTable.status, "active"),
        ),
      });

      if (activeListing) {
        const { platformFee, sellerPayout } = calculatePlatformFee(priceAmount);
        const agent = await tx.query.agentsTable.findFirst({
          where: eq(agentsTable.id, proposal.agentId),
        });

        const [order] = await tx
          .insert(marketplaceOrdersTable)
          .values({
            listingId: activeListing.id,
            buyerUserId: posterUserId,
            sellerUserId: agent!.userId,
            agentId: proposal.agentId,
            taskDescription: `Job: ${job.title} — ${proposal.approach ?? ""}`,
            priceAmount: priceAmount.toFixed(2),
            platformFee: platformFee.toFixed(2),
            sellerPayout: sellerPayout.toFixed(2),
            status: "pending",
            paymentProvider: "stripe",
          })
          .returning();

        linkedOrderId = order.id;

        const task = await submitTask({
          recipientAgentId: proposal.agentId,
          senderUserId: posterUserId,
          taskType: "job_board_order",
          payload: {
            jobId: job.id,
            jobTitle: job.title,
            proposalId: proposal.id,
            orderId: order.id,
            approach: proposal.approach,
            priceAmount: priceAmount.toFixed(2),
            deliveryHours: proposal.deliveryHours ?? job.deadlineHours,
          },
          relatedOrderId: order.id,
        });

        linkedTaskId = task.id;
      } else {
        const task = await submitTask({
          recipientAgentId: proposal.agentId,
          senderUserId: posterUserId,
          taskType: "job_board_order",
          payload: {
            jobId: job.id,
            jobTitle: job.title,
            proposalId: proposal.id,
            approach: proposal.approach,
            priceAmount: priceAmount.toFixed(2),
            deliveryHours: proposal.deliveryHours ?? job.deadlineHours,
          },
        });

        linkedTaskId = task.id;
      }

      await tx
        .update(jobPostsTable)
        .set({
          status: "filled",
          acceptedProposalId: proposal.id,
          linkedTaskId,
          linkedOrderId,
          updatedAt: new Date(),
        })
        .where(eq(jobPostsTable.id, jobId));

      await tx
        .update(jobProposalsTable)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(
          and(
            eq(jobProposalsTable.jobId, jobId),
            eq(jobProposalsTable.status, "pending"),
            sql`${jobProposalsTable.id} != ${proposalId}`,
          ),
        );

      return { proposal: accepted, linkedTaskId, linkedOrderId };
    });

    await logActivity({
      agentId: proposal.agentId,
      eventType: "agent.proposal_accepted",
      payload: {
        proposalId: proposal.id,
        jobId: job.id,
        jobTitle: job.title,
        linkedTaskId: result.linkedTaskId,
        linkedOrderId: result.linkedOrderId,
        priceAmount: priceAmount.toFixed(2),
      },
    });

    return { success: true, proposal: result.proposal };
  }

  const [updated] = await db
    .update(jobProposalsTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(jobProposalsTable.id, proposalId))
    .returning();

  await logActivity({
    agentId: proposal.agentId,
    eventType: "agent.proposal_rejected",
    payload: {
      proposalId: proposal.id,
      jobId: job.id,
      jobTitle: job.title,
    },
  });

  return { success: true, proposal: updated };
}

export async function withdrawProposal(
  jobId: string,
  proposalId: string,
  userId: string,
): Promise<{ success: boolean; proposal?: JobProposal; error?: string }> {
  const proposal = await db.query.jobProposalsTable.findFirst({
    where: and(
      eq(jobProposalsTable.id, proposalId),
      eq(jobProposalsTable.jobId, jobId),
      eq(jobProposalsTable.userId, userId),
    ),
  });

  if (!proposal) return { success: false, error: "PROPOSAL_NOT_FOUND" };
  if (proposal.status !== "pending") {
    return { success: false, error: `INVALID_STATUS:${proposal.status}` };
  }

  const [updated] = await db
    .update(jobProposalsTable)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(eq(jobProposalsTable.id, proposalId))
    .returning();

  return { success: true, proposal: updated };
}

export async function getProposalsByJob(
  jobId: string,
  limit = 20,
  offset = 0,
): Promise<{ proposals: JobProposal[]; total: number }> {
  const where = eq(jobProposalsTable.jobId, jobId);

  const [proposals, countResult] = await Promise.all([
    db
      .select()
      .from(jobProposalsTable)
      .where(where)
      .orderBy(desc(jobProposalsTable.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobProposalsTable)
      .where(where),
  ]);

  return { proposals, total: countResult[0]?.count ?? 0 };
}

export async function getMyProposals(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ proposals: JobProposal[]; total: number }> {
  const where = eq(jobProposalsTable.userId, userId);

  const [proposals, countResult] = await Promise.all([
    db
      .select()
      .from(jobProposalsTable)
      .where(where)
      .orderBy(desc(jobProposalsTable.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobProposalsTable)
      .where(where),
  ]);

  return { proposals, total: countResult[0]?.count ?? 0 };
}

export async function getProposalById(
  proposalId: string,
): Promise<JobProposal | null> {
  const proposal = await db.query.jobProposalsTable.findFirst({
    where: eq(jobProposalsTable.id, proposalId),
  });
  return proposal ?? null;
}
