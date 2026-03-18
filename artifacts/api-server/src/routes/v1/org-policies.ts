/**
 * Org Policy Routes — Phase 3
 *
 * Enterprise policy engine for organizations. Policy is evaluated at token issuance.
 *
 * GET    /v1/orgs/:orgId/policies        — List policies for an org
 * POST   /v1/orgs/:orgId/policies        — Create a policy
 * DELETE /v1/orgs/:orgId/policies/:id    — Delete a policy
 */
import { Router } from "express";
import { z } from "zod/v4";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentOrganizationsTable,
  orgMembersTable,
  orgPoliciesTable,
} from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";

const router = Router({ mergeParams: true });

router.use(requireAuth);

async function requireOrgAccess(userId: string, orgId: string) {
  const org = await db.query.agentOrganizationsTable.findFirst({
    where: eq(agentOrganizationsTable.id, orgId),
  });
  if (!org) throw new AppError(404, "NOT_FOUND", "Organization not found");

  if (org.ownerUserId !== userId) {
    const membership = await db.query.orgMembersTable.findFirst({
      where: and(
        eq(orgMembersTable.orgId, orgId),
        eq(orgMembersTable.userId, userId),
      ),
    });
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new AppError(403, "FORBIDDEN", "Admin access required for this organization");
    }
  }
  return org;
}

const VALID_POLICY_TYPES = [
  "require_owner_for_scope",
  "restrict_unclaimed_agents",
  "max_trust_tier_required",
  "required_trust_tier",
  "required_scopes",
  "verified_only",
] as const;

const createPolicySchema = z.object({
  policyType: z.enum([
    "require_owner_for_scope",
    "restrict_unclaimed_agents",
    "max_trust_tier_required",
    "required_trust_tier",
    "required_scopes",
    "verified_only",
  ]),
  config: z.record(z.string(), z.unknown()),
});

router.get("/", async (req, res, next) => {
  try {
    const orgId = (req.params as { orgId?: string }).orgId as string;
    const userId = req.user!.id;

    await requireOrgAccess(userId, orgId);

    const policies = await db.query.orgPoliciesTable.findMany({
      where: eq(orgPoliciesTable.orgId, orgId),
    });

    res.json({ orgId, policies });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const orgId = (req.params as { orgId?: string }).orgId as string;
    const userId = req.user!.id;

    await requireOrgAccess(userId, orgId);

    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);

    const { policyType, config } = parsed.data;

    const [policy] = await db.insert(orgPoliciesTable).values({
      orgId,
      policyType,
      config: config as Record<string, unknown>,
    }).returning();

    res.status(201).json(policy);
  } catch (err) {
    next(err);
  }
});

router.delete("/:policyId", async (req, res, next) => {
  try {
    const orgId = (req.params as { orgId?: string; policyId?: string }).orgId as string;
    const policyId = (req.params as { orgId?: string; policyId?: string }).policyId as string;
    const userId = req.user!.id;

    await requireOrgAccess(userId, orgId);

    const policy = await db.query.orgPoliciesTable.findFirst({
      where: and(
        eq(orgPoliciesTable.id, policyId),
        eq(orgPoliciesTable.orgId, orgId),
      ),
    });
    if (!policy) throw new AppError(404, "NOT_FOUND", "Policy not found");

    await db.delete(orgPoliciesTable).where(eq(orgPoliciesTable.id, policyId));

    res.json({ success: true, policyId });
  } catch (err) {
    next(err);
  }
});

export default router;
