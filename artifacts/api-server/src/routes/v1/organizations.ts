import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { userRateLimit } from "../../middlewares/rate-limit";
import { isAgentOwner } from "../../services/agents";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentOrganizationsTable,
  orgMembersTable,
  orgAgentsTable,
  agentsTable,
} from "@workspace/db/schema";

async function calculateOrgTrustScore(orgId: string): Promise<{ trustScore: number | null; trustTier: string | null }> {
  const result = await db
    .select({
      avgScore: sql<number>`AVG(${agentsTable.trustScore})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(orgAgentsTable)
    .innerJoin(agentsTable, eq(orgAgentsTable.agentId, agentsTable.id))
    .where(eq(orgAgentsTable.orgId, orgId));

  const avgScore = result[0]?.count > 0 ? Number(result[0]?.avgScore ?? 0) : null;
  if (avgScore === null) return { trustScore: null, trustTier: null };

  const rounded = Math.round(avgScore);
  let trustTier: string;
  if (rounded >= 90) trustTier = "elite";
  else if (rounded >= 70) trustTier = "trusted";
  else if (rounded >= 40) trustTier = "verified";
  else if (rounded >= 20) trustTier = "basic";
  else trustTier = "unverified";

  await db
    .update(agentOrganizationsTable)
    .set({ trustScore: rounded, trustTier: trustTier as "unverified" | "basic" | "verified" | "trusted" | "elite", updatedAt: new Date() })
    .where(eq(agentOrganizationsTable.id, orgId));

  return { trustScore: rounded, trustTier };
}

const router = Router();

const createOrgSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  displayName: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  avatarUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
});

router.post("/", requireAuth, userRateLimit, async (req, res, next) => {
  try {
    const parsed = createOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const existing = await db.query.agentOrganizationsTable.findFirst({
      where: eq(agentOrganizationsTable.slug, parsed.data.slug.toLowerCase()),
    });
    if (existing) {
      throw new AppError(409, "SLUG_TAKEN", "This organization slug is already in use");
    }

    const [org] = await db
      .insert(agentOrganizationsTable)
      .values({
        ...parsed.data,
        slug: parsed.data.slug.toLowerCase(),
        ownerUserId: req.userId!,
      })
      .returning();

    await db.insert(orgMembersTable).values({
      orgId: org.id,
      userId: req.userId!,
      role: "owner",
    });

    const APP_URL = process.env.APP_URL || "https://getagent.id";

    res.status(201).json({
      ...org,
      namespace: `${org.slug}.agentid`,
      namespaceUrl: `${APP_URL}/org/${org.slug}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const org = await db.query.agentOrganizationsTable.findFirst({
      where: eq(agentOrganizationsTable.slug, slug),
    });
    if (!org) {
      throw new AppError(404, "NOT_FOUND", "Organization not found");
    }

    const orgAgentRows = await db
      .select({
        agentId: orgAgentsTable.agentId,
        handle: agentsTable.handle,
        displayName: agentsTable.displayName,
        description: agentsTable.description,
        avatarUrl: agentsTable.avatarUrl,
        status: agentsTable.status,
        trustScore: agentsTable.trustScore,
        verificationStatus: agentsTable.verificationStatus,
        capabilities: agentsTable.capabilities,
      })
      .from(orgAgentsTable)
      .innerJoin(agentsTable, eq(orgAgentsTable.agentId, agentsTable.id))
      .where(eq(orgAgentsTable.orgId, org.id));

    const members = await db.query.orgMembersTable.findMany({
      where: eq(orgMembersTable.orgId, org.id),
    });

    const orgTrust = await calculateOrgTrustScore(org.id);

    res.json({
      ...org,
      namespace: `${org.slug}.agentid`,
      agentCount: orgAgentRows.length,
      agents: orgAgentRows,
      memberCount: members.length,
      trustScore: orgTrust.trustScore,
      trustTier: orgTrust.trustTier,
    });
  } catch (err) {
    next(err);
  }
});

const addAgentSchema = z.object({
  agentId: z.string().uuid(),
});

router.post("/:orgSlug/agents", requireAuth, async (req, res, next) => {
  try {
    const slug = (req.params.orgSlug as string).toLowerCase();
    const parsed = addAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const org = await db.query.agentOrganizationsTable.findFirst({
      where: eq(agentOrganizationsTable.slug, slug),
    });
    if (!org) {
      throw new AppError(404, "NOT_FOUND", "Organization not found");
    }

    const membership = await db.query.orgMembersTable.findFirst({
      where: and(
        eq(orgMembersTable.orgId, org.id),
        eq(orgMembersTable.userId, req.userId!),
      ),
    });
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new AppError(403, "FORBIDDEN", "You must be an org owner or admin to add agents");
    }

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, parsed.data.agentId),
    });
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    const existingLink = await db.query.orgAgentsTable.findFirst({
      where: and(
        eq(orgAgentsTable.orgId, org.id),
        eq(orgAgentsTable.agentId, parsed.data.agentId),
      ),
    });
    if (existingLink) {
      throw new AppError(409, "ALREADY_ADDED", "Agent is already in this organization");
    }

    const [link] = await db
      .insert(orgAgentsTable)
      .values({
        orgId: org.id,
        agentId: parsed.data.agentId,
        addedByUserId: req.userId!,
      })
      .returning();

    await db
      .update(agentsTable)
      .set({
        orgId: org.id,
        orgNamespace: `${org.slug}.${agent.handle}`,
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, parsed.data.agentId));

    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
});

router.delete("/:orgSlug/agents/:agentId", requireAuth, async (req, res, next) => {
  try {
    const slug = (req.params.orgSlug as string).toLowerCase();
    const agentId = req.params.agentId as string;

    const org = await db.query.agentOrganizationsTable.findFirst({
      where: eq(agentOrganizationsTable.slug, slug),
    });
    if (!org) {
      throw new AppError(404, "NOT_FOUND", "Organization not found");
    }

    const membership = await db.query.orgMembersTable.findFirst({
      where: and(
        eq(orgMembersTable.orgId, org.id),
        eq(orgMembersTable.userId, req.userId!),
      ),
    });
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new AppError(403, "FORBIDDEN", "You must be an org owner or admin to remove agents");
    }

    await db
      .delete(orgAgentsTable)
      .where(
        and(
          eq(orgAgentsTable.orgId, org.id),
          eq(orgAgentsTable.agentId, agentId),
        ),
      );

    await db
      .update(agentsTable)
      .set({ orgId: null, orgNamespace: null, updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId));

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/:orgSlug/members", requireAuth, async (req, res, next) => {
  try {
    const slug = (req.params.orgSlug as string).toLowerCase();
    const org = await db.query.agentOrganizationsTable.findFirst({
      where: eq(agentOrganizationsTable.slug, slug),
    });
    if (!org) {
      throw new AppError(404, "NOT_FOUND", "Organization not found");
    }

    const membership = await db.query.orgMembersTable.findFirst({
      where: and(
        eq(orgMembersTable.orgId, org.id),
        eq(orgMembersTable.userId, req.userId!),
      ),
    });
    if (!membership) {
      throw new AppError(403, "FORBIDDEN", "You must be a member of this organization to view members");
    }

    const members = await db.query.orgMembersTable.findMany({
      where: eq(orgMembersTable.orgId, org.id),
      columns: {
        id: true,
        orgId: true,
        role: true,
        createdAt: true,
      },
    });

    res.json({ members });
  } catch (err) {
    next(err);
  }
});

export default router;
