import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { z } from "zod/v4";
import { logger } from "../../middlewares/request-logger";
import { requireAuth } from "../../middlewares/replit-auth";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import {
  createAgent,
  listAgentsByUser,
  getAgentById,
  isAgentOwner,
  updateAgent,
  deleteAgent,
  validateHandle,
  isHandleAvailable,
  getHandleReservation,
  type RevokeAgentInput,
} from "../../services/agents";
import { logActivity } from "../../services/activity-logger";
import { recomputeAndStore } from "../../services/trust-score";
import { checkRateLimit, checkHandleRegistrationLimits, recordHandleRegistration, isHandleReserved } from "../../services/handle";
import { requirePlanFeature, getHandlePriceCents, getUserPlan, getPlanLimits, isEligibleForIncludedHandle, claimIncludedHandleBenefit, claimIncludedHandleBenefitTx, releaseIncludedHandleClaim } from "../../services/billing";
import {
  getActiveCredential,
  issueCredential,
  reissueCredential,
} from "../../services/credentials";
import { clearVcCache } from "../../services/verifiable-credential";
import { buildBootstrapBundle } from "./agent-runtime";
import { verifyClaimToken, generateClaimToken } from "../../utils/claim-token";
import { hashClaimToken } from "../../utils/crypto";
import { desc, eq, and, gte, sql, count } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentActivityLogTable, agentsTable, agentClaimTokensTable, agentReportsTable, tasksTable, agentClaimHistoryTable, auditEventsTable, agentOwsWalletsTable, type Agent } from "@workspace/db/schema";

const router = Router();

router.get("/whoami", requireAgentAuth, async (req, res, next) => {
  try {
    const agent = req.authenticatedAgent!;
    const [bundle, plan] = await Promise.all([
      buildBootstrapBundle(agent),
      getUserPlan(agent.userId),
    ]);
    const limits = getPlanLimits(plan);
    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const entitlements = {
      inbox: limits.canReceiveMail,
      tasks: limits.tasksAccess,
      fleet: limits.fleetManagement,
      analytics: limits.analyticsAccess,
      marketplace: limits.canListOnMarketplace,
      trustScore: true,
      currentPlan: plan,
      upgradeUrl: `${APP_URL}/pricing`,
    };
    res.json({ ...bundle, entitlements });
  } catch (err) {
    next(err);
  }
});

// Validates that an endpointUrl is an external HTTPS URL and not a private/internal IP address.
// Prevents SSRF attacks that could expose cloud metadata services (169.254.169.254) or internal services.
const safeEndpointUrl = z.url().refine((url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    // Block localhost and loopback
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    // Block link-local (169.254.x.x — AWS/GCP metadata)
    if (/^169\.254\./.test(host)) return false;
    // Block private RFC1918 ranges
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}, { message: "endpointUrl must be a public HTTPS URL. Private IPs and localhost are not permitted." });

// Sanitize metadata to prevent prototype pollution and limit size.
const safeMetadata = z.record(
  z.string().max(64).refine(k => !["__proto__", "constructor", "prototype"].includes(k), {
    message: "Reserved metadata key",
  }),
  z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]),
).max(50).optional();

const createAgentSchema = z.object({
  handle: z.string().min(3).max(32).optional(),
  displayName: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  endpointUrl: safeEndpointUrl.optional(),
  capabilities: z.array(z.string().max(100)).max(50).optional(),
  scopes: z.array(z.string().max(100)).max(50).optional(),
  protocols: z.array(z.string().max(100)).max(20).optional(),
  authMethods: z.array(z.string().max(100)).max(10).optional(),
  paymentMethods: z.array(z.string().max(100)).max(10).optional(),
  isPublic: z.boolean().optional(),
  metadata: safeMetadata,
});

const updateAgentSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  endpointUrl: safeEndpointUrl.optional(),
  endpointSecret: z.string().max(500).optional(),
  capabilities: z.array(z.string().max(100)).max(50).optional(),
  scopes: z.array(z.string().max(100)).max(50).optional(),
  protocols: z.array(z.string().max(100)).max(20).optional(),
  authMethods: z.array(z.string().max(100)).max(10).optional(),
  paymentMethods: z.array(z.string().max(100)).max(10).optional(),
  isPublic: z.boolean().optional(),
  status: z.enum(["draft", "active", "inactive"]).optional(),
  avatarUrl: safeEndpointUrl.optional(),
  metadata: safeMetadata,
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { handle } = parsed.data;
    const isSandbox = req.isSandbox === true;

    // Declared at outer scope so the compensation catch block can release it if
    // agent creation fails after an atomic benefit claim succeeds.
    let claimSubId: string | undefined = undefined;
    // Outer-scope pending audit record ID so the catch block can update it on stranded/compensated outcome.
    let agentPendingAuditId: string | null = null;
    let handlePriceCents = 0;
    let pricingTier: string | undefined;
    let isStandardHandle = false;
    let sandboxHandle: string | undefined;
    let normalizedHandle: string | undefined;

    if (handle) {
      normalizedHandle = handle.toLowerCase();

      if (!isSandbox) {
        const rateLimitCheck = await checkRateLimit(req.userId!);
        if (rateLimitCheck) {
          throw new AppError(rateLimitCheck.status, "RATE_LIMIT_EXCEEDED", rateLimitCheck.message);
        }

        try {
          await recordHandleRegistration(req.userId!, normalizedHandle);
        } catch (err) {
          logger.warn({ err, handle: normalizedHandle }, "[agents] Failed to record handle registration attempt");
        }
      }

      const handleError = validateHandle(normalizedHandle);
      if (handleError) {
        throw new AppError(400, "INVALID_HANDLE", handleError);
      }

      if (isHandleReserved(normalizedHandle)) {
        throw new AppError(400, "HANDLE_RESERVED", "This handle is reserved");
      }

      const reservation = await getHandleReservation(normalizedHandle);
      if (reservation.isReserved) {
        throw new AppError(400, "HANDLE_RESERVED", "This handle is reserved");
      }

      const limitCheck = await checkHandleRegistrationLimits(req.userId!, normalizedHandle);
      if (limitCheck) {
        throw new AppError(limitCheck.status, "HANDLE_LIMIT_EXCEEDED", limitCheck.message);
      }

      const available = await isHandleAvailable(normalizedHandle);
      if (!available) {
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }

      handlePriceCents = getHandlePriceCents(normalizedHandle);
      const handleLen = normalizedHandle.replace(/[^a-z0-9]/g, "").length;
      pricingTier = handleLen === 3 ? "premium_3" : handleLen === 4 ? "premium_4" : "standard_5plus";
      isStandardHandle = handleLen >= 5;

      if (!isSandbox) {
        const userPlan = await getUserPlan(req.userId!);
        const APP_URL = process.env.APP_URL ?? "https://getagent.id";

        if (!isStandardHandle) {
          res.status(402).json({
            code: "HANDLE_PAYMENT_REQUIRED",
            message: `This handle requires payment of $${(handlePriceCents / 100).toFixed(2)}/year. Use POST /api/v1/billing/handle-checkout to start checkout.`,
            handle: normalizedHandle,
            priceCents: handlePriceCents,
            priceDollars: handlePriceCents / 100,
            tier: pricingTier,
            characterLength: handleLen,
            includedWithPaidPlan: false,
            includesOnChainMint: true,
            checkoutUrl: `${APP_URL}/api/v1/billing/handle-checkout`,
            handlePricing: {
              annualPriceCents: handlePriceCents,
              annualPriceDollars: handlePriceCents / 100,
              tier: pricingTier,
              characterLength: handleLen,
              includedWithPaidPlan: false,
              onChainMintPrice: 0,
              onChainMintPriceDollars: 0,
              includesOnChainMint: true,
            },
          });
          return;
        }

        if (!isEligibleForIncludedHandle(userPlan)) {
          // User doesn't have an included handle benefit — route them to the paid checkout
          // (same flow as premium handles). Standard handles are $9/yr for non-plan users.
          res.status(402).json({
            code: "HANDLE_PAYMENT_REQUIRED",
            message: `Standard handles (5+ characters) are included free with Starter or Pro plans, or available for $${(handlePriceCents / 100).toFixed(2)}/year. Use POST /api/v1/billing/handle-checkout to start checkout.`,
            handle: normalizedHandle,
            priceCents: handlePriceCents,
            priceDollars: handlePriceCents / 100,
            tier: pricingTier,
            characterLength: handleLen,
            includedWithPaidPlan: true,
            checkoutUrl: `${APP_URL}/api/v1/billing/handle-checkout`,
            upgradeUrl: `${APP_URL}/pricing`,
            handlePricing: {
              annualPriceCents: handlePriceCents,
              annualPriceDollars: handlePriceCents / 100,
              tier: pricingTier,
              characterLength: handleLen,
              includedWithPaidPlan: true,
            },
          });
          return;
        }

        // Write durable pending intent before consuming the entitlement.
        // Abort if this fails — without a pending marker the claim has no crash-recovery artifact.
        try {
          const agentPendingResult = await db.insert(auditEventsTable).values({
            actorType: "user",
            actorId: req.userId!,
            eventType: "billing.included_handle_claim.pending",
            targetType: "agent",
            targetId: null,
            payload: {
              handle: normalizedHandle,
              state: "pending",
              requiredAction: "claim_and_create_agent",
            },
          }).returning({ id: auditEventsTable.id });
          agentPendingAuditId = agentPendingResult[0]?.id ?? null;
          if (!agentPendingAuditId) {
            throw new Error("Pending audit record insert returned no ID");
          }
        } catch (pendingErr) {
          // Fail the request — cannot consume entitlement without a durable pending marker.
          // A missing pending record would leave no recovery artifact if the process crashes
          // between claim and agent creation, permanently stranding the benefit.
          logger.error({ handle: normalizedHandle, userId: req.userId, pendingErr }, "[agents] pending audit write failed — aborting claim (no recovery artifact)");
          throw new AppError(503, "AUDIT_WRITE_FAILED", "Temporary system error — please retry your request");
        }

        // Acquire a Postgres session-level advisory lock keyed on the handle to prevent
        // concurrent requests from racing through the availability re-check and claim.
        // The lock is held until the transaction commits/rolls back (xact-level advisory).
        // We then do a direct DB query (bypassing the in-process cache) to confirm the
        // handle is still available before consuming the subscription entitlement.
        let claimResult: { claimed: boolean; subscriptionId?: string } = { claimed: false };
        claimResult = await db.transaction(async (tx) => {
          // Derive a stable int64 lock key from the handle string via hashtext().
          // pg_advisory_xact_lock blocks until all competing transactions release the same key.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${normalizedHandle!}))`);

          // Re-check availability inside the transaction with a direct DB query
          // (not the cache-backed isHandleAvailable) to see the latest committed state.
          const existingRow = await tx.query.agentsTable.findFirst({
            where: sql`lower(${agentsTable.handle}) = lower(${normalizedHandle!})`,
            columns: { id: true },
          });
          if (existingRow) {
            throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
          }

          // With the advisory lock held and availability confirmed, claim the benefit
          // using the transaction-scoped variant so all reads/writes share the same
          // Postgres connection and are visible within this transaction boundary.
          return claimIncludedHandleBenefitTx(tx, req.userId!, normalizedHandle!);
        });
        const { claimed, subscriptionId } = claimResult;
        if (!claimed) {
          res.status(402).json({
            code: "HANDLE_BENEFIT_ALREADY_USED",
            message: "The one included handle benefit for your plan has already been used. Additional handles can be purchased via the handle checkout.",
            handle: normalizedHandle,
            tier: pricingTier,
            characterLength: handleLen,
            checkoutUrl: `${APP_URL}/api/v1/billing/handle-checkout`,
          });
          return;
        }
        // Store subscriptionId so we can release the claim if agent creation fails below.
        claimSubId = subscriptionId;
      }

      sandboxHandle = isSandbox ? `sandbox-${normalizedHandle}` : normalizedHandle;
    }

    const resolvedHandleLen = normalizedHandle ? normalizedHandle.replace(/[^a-z0-9]/g, "").length : null;

    let agent;
    try {
      agent = await createAgent({
        userId: req.userId!,
        ...parsed.data,
        handle: sandboxHandle ?? null,
        _skipHandleValidation: isSandbox,
        metadata: {
          ...(parsed.data.metadata || {}),
          ...(isSandbox ? { isSandbox: true, sandboxCreatedAt: new Date().toISOString() } : {}),
          ...(sandboxHandle ? {
            handlePricing: {
              annualPriceCents: handlePriceCents,
              tier: pricingTier,
              characterLength: resolvedHandleLen,
              paymentStatus: isStandardHandle ? "included" : "paid",
              includedWithPaidPlan: isStandardHandle,
              registeredAt: new Date().toISOString(),
            },
          } : {}),
        },
      });
    } catch (err) {
      // If we atomically claimed the included-handle benefit above and agent creation
      // now fails, release the claim so the user can retry.
      // If the release itself fails (DB transient failure), record a durable stranded-claim
      // audit event so recovery tooling can detect and replay it.
      if (claimSubId) {
        let releaseSucceeded = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await releaseIncludedHandleClaim(claimSubId);
            releaseSucceeded = true;
            break;
          } catch {
            if (attempt === 0) await new Promise((r) => setTimeout(r, 200));
          }
        }
        if (!releaseSucceeded) {
          logger.error(
            { claimSubId, handle: normalizedHandle, userId: req.userId },
            "[agents] compensation failed after agent creation failure — recorded for recovery",
          );
          const strandedPayload = {
            handle: normalizedHandle ?? null,
            agentId: null,
            subscriptionId: claimSubId,
            state: "stranded",
            assignError: err instanceof Error ? err.message : String(err),
            requiredAction: "release_claim_and_retry_assignment",
          };
          if (agentPendingAuditId) {
            db.update(auditEventsTable)
              .set({ payload: strandedPayload })
              .where(eq(auditEventsTable.id, agentPendingAuditId))
              .catch((auditErr: unknown) => {
                logger.error({ auditErr, claimSubId }, "[agents] stranded-claim audit update failed");
                db.insert(auditEventsTable).values({
                  actorType: "user",
                  actorId: req.userId!,
                  eventType: "billing.included_handle_claim.stranded",
                  payload: strandedPayload,
                }).catch(() => {});
              });
          } else {
            db.insert(auditEventsTable).values({
              actorType: "user",
              actorId: req.userId!,
              eventType: "billing.included_handle_claim.stranded",
              payload: strandedPayload,
            }).catch((auditErr: unknown) => {
              logger.error({ auditErr, claimSubId }, "[agents] stranded-claim audit write failed");
            });
          }
        } else {
          // Release succeeded: update pending audit record to compensated state
          if (agentPendingAuditId) {
            db.update(auditEventsTable)
              .set({ payload: { handle: normalizedHandle ?? null, agentId: null, subscriptionId: claimSubId, state: "compensated", reason: "agent_creation_failure_claim_released" } })
              .where(eq(auditEventsTable.id, agentPendingAuditId))
              .catch(() => { /* best-effort */ });
          }
        }
      }
      if (err instanceof Error && err.message === "HANDLE_CONFLICT") {
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }
      // Fallback: catch PostgreSQL unique constraint violation (code 23505) for handle uniqueness
      const pgErr = err as { code?: string };
      if (pgErr?.code === "23505") {
        throw new AppError(409, "HANDLE_TAKEN", "This handle is already in use");
      }
      throw err;
    }

    if (!isSandbox && sandboxHandle) {
      await db.update(agentsTable).set({
        handleStatus: "active",
        nftStatus: "none",
        paidThrough: null,
        updatedAt: new Date(),
      }).where(eq(agentsTable.id, agent.id));
    }

    // Update pending audit record to completed state after successful agent creation
    if (agentPendingAuditId) {
      db.update(auditEventsTable)
        .set({ payload: { handle: normalizedHandle ?? null, agentId: agent.id, subscriptionId: claimSubId ?? null, state: "completed" } })
        .where(eq(auditEventsTable.id, agentPendingAuditId))
        .catch(() => { /* best-effort */ });
    }

    await logActivity({
      agentId: agent.id,
      eventType: "agent.created",
      payload: {
        handle: agent.handle,
        handlePriceCents,
        pricingTier,
        isStandardHandle,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId: agent.id,
        eventType: "agent.created",
        payload: { handle: agent.handle ?? null },
        isPublic: true,
      });
    } catch {}

    await recomputeAndStore(agent.id);

    const claimTokenValue = `aid_claim_${randomBytes(24).toString("hex")}`;
    const hashedClaimToken = hashClaimToken(claimTokenValue);
    await db.insert(agentClaimTokensTable).values({
      agentId: agent.id,
      token: hashedClaimToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    let owsWalletAddress: string | null = null;
    try {
      const { provisionOwsWallet } = await import("../../services/ows-wallet");
      const owsResult = await provisionOwsWallet(agent.id, req.userId!);
      owsWalletAddress = owsResult?.address ?? null;
    } catch (err) {
      logger.warn({ agentId: agent.id, error: err instanceof Error ? err.message : err }, "[agents] OWS wallet provisioning failed (non-fatal)");
    }

    res.status(201).json({
      ...agent,
      claimToken: claimTokenValue,
      isSandbox,
      walletAddress: owsWalletAddress ?? agent.walletAddress ?? null,
      walletNetwork: owsWalletAddress ? "base" : (agent.walletNetwork ?? null),
      walletIsSelfCustodial: owsWalletAddress ? true : (agent.walletIsSelfCustodial ?? false),
      ...(isSandbox ? { sandboxRef: `sandbox_${agent.id}` } : {}),
      ...(sandboxHandle ? {
        handlePricing: {
          annualPriceCents: handlePriceCents,
          annualPriceDollars: handlePriceCents / 100,
          tier: pricingTier,
          characterLength: resolvedHandleLen,
          includedWithPaidPlan: isStandardHandle,
          onChainMintPrice: 0,
          onChainMintPriceDollars: 0,
          includesOnChainMint: true,
        },
      } : {}),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const agents = await listAgentsByUser(req.userId!);
    const enriched = agents.map((a) => {
      const meta = (a.metadata || {}) as Record<string, unknown>;
      const hp = meta.handlePricing as Record<string, unknown> | undefined;
      return {
        ...a,
        handlePricing: hp
          ? {
              annualPriceCents: hp.annualPriceCents,
              annualPriceDollars: Number(hp.annualPriceCents) / 100,
              tier: hp.tier,
              characterLength: hp.characterLength,
              paymentStatus: hp.paymentStatus,
            }
          : undefined,
      };
    });
    res.json({ agents: enriched });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }
    res.json(agent);
  } catch (err) {
    next(err);
  }
});

router.put("/:agentId", requireAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    if (Object.keys(parsed.data).length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "No fields to update");
    }

    if (parsed.data.metadata) {
      const incoming = parsed.data.metadata as Record<string, unknown>;
      delete incoming.handlePricing;
    }

    if (parsed.data.isPublic === true) {
      const eligibility = await requirePlanFeature(req.userId!, "canListOnMarketplace");
      if (!eligibility.allowed) {
        throw new AppError(403, "PLAN_REQUIRED",
          `Marketplace listing requires the ${eligibility.requiredPlan} plan or higher. Current plan: ${eligibility.currentPlan}`);
      }
    }

    const existingAgent = await getAgentById(agentId);
    if (existingAgent) {
      if (existingAgent.status === "revoked") {
        throw new AppError(409, "AGENT_REVOKED", "Revoked agents cannot be modified. Revocation is permanent and can only be appealed via admin.");
      }
      if (parsed.data.status === "active" && existingAgent.status === "draft") {
        throw new AppError(422, "INVALID_TRANSITION",
          "Draft agents cannot be directly activated. Complete the verification flow: draft → pending_verification → active.");
      }
      const meta = (existingAgent.metadata || {}) as Record<string, unknown>;
      const hp = meta.handlePricing as Record<string, unknown> | undefined;
      if (hp?.paymentStatus === "pending") {
        if (parsed.data.status === "active") {
          throw new AppError(402, "HANDLE_PAYMENT_REQUIRED",
            "Handle payment must be completed before activating this agent. Use POST /billing/handle-checkout.");
        }
        if (parsed.data.isPublic === true) {
          throw new AppError(402, "HANDLE_PAYMENT_REQUIRED",
            "Handle payment must be completed before listing this agent publicly.");
        }
      }
    }

    const updated = await updateAgent(agentId, req.userId!, parsed.data);
    if (!updated) {
      throw new AppError(404, "NOT_FOUND", "Agent not found or you do not own it");
    }

    const changedFields = Object.keys(parsed.data);
    await logActivity({
      agentId: updated.id,
      eventType: changedFields.includes("endpointUrl")
        ? "agent.endpoint_updated"
        : changedFields.includes("status")
          ? "agent.status_changed"
          : "agent.updated",
      payload: { updatedFields: changedFields },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const trustRelevantChanged = changedFields.some((f) => ["endpointUrl", "capabilities", "description", "avatarUrl", "protocols"].includes(f));
    const credentialRelevantChanged = changedFields.some((f) => ["capabilities", "protocols"].includes(f));

    if (trustRelevantChanged) {
      const result = await recomputeAndStore(updated.id);
      const previousScore = existingAgent?.trustScore ?? 0;
      const scoreChangedEnough = Math.abs(result.trustScore - previousScore) >= 5;

      if (credentialRelevantChanged && !scoreChangedEnough) {
        try {
          await reissueCredential(updated.id);
        } catch (err) {
          logger.error({ err }, "[agents] Failed to reissue credential after update");
        }
      }
    } else if (credentialRelevantChanged) {
      try {
        await reissueCredential(updated.id);
      } catch (err) {
        logger.error({ err }, "[agents] Failed to reissue credential after update");
      }
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

function requireHumanOrAgentAuthForDelete(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-agent-key"]) {
    return requireAgentAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      next();
    });
  }
  return requireAuth(req, res, next);
}

router.delete("/:agentId", requireHumanOrAgentAuthForDelete, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    if (req.authenticatedAgent) {
      if (req.authenticatedAgent.id !== agentId) {
        throw new AppError(403, "FORBIDDEN", "An agent can only delete itself");
      }
    } else {
      if (!isAgentOwner(agent, req.userId!)) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
    }

    await logActivity({
      agentId: agent.id,
      eventType: "agent.deleted",
      payload: { handle: agent.handle, deletedBy: req.authenticatedAgent ? "agent-key" : "user" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await deleteAgent(agentId, agent.userId);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

function requireHumanOrAgentAuthForActivity(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-agent-key"]) {
    return requireAgentAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      next();
    });
  }
  return requireAuth(req, res, next);
}

router.get("/:agentId/activity", requireHumanOrAgentAuthForActivity, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;

    if (req.authenticatedAgent) {
      if (req.authenticatedAgent.id !== agentId) {
        throw new AppError(403, "FORBIDDEN", "Agent can only read its own activity log");
      }
    } else {
      const agent = await getAgentById(agentId);
      if (!agent) {
        throw new AppError(404, "NOT_FOUND", "Agent not found");
      }
      if (!isAgentOwner(agent, req.userId!)) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
    }

    const source = req.query.source as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    if (source === "signed") {
      const { getSignedActivityLog } = await import("../../services/activity-log");
      const result = await getSignedActivityLog(agentId, limit, offset);
      res.json({ activities: result.activities, total: result.total, limit, offset, source: "signed" });
      return;
    }

    const condition = eq(agentActivityLogTable.agentId, agentId);
    const [activities, countResult] = await Promise.all([
      db.query.agentActivityLogTable.findMany({
        where: condition,
        orderBy: [desc(agentActivityLogTable.createdAt)],
        limit,
        offset,
      }),
      db.select({ total: count() }).from(agentActivityLogTable).where(condition),
    ]);

    res.json({ activities, total: countResult[0]?.total ?? 0, limit, offset });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/keys/rotate", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only rotate its own keys");
    }

    const { oldKeyId, newPublicKey, keyType, reason, immediateRevoke } = req.body;
    if (!oldKeyId || !newPublicKey) {
      throw new AppError(400, "VALIDATION_ERROR", "oldKeyId and newPublicKey are required");
    }

    // H2: Enforce ed25519-only at the route layer — reject any other key type at ingest
    const resolvedKeyType = keyType || "ed25519";
    if (resolvedKeyType !== "ed25519") {
      throw new AppError(400, "UNSUPPORTED_KEY_TYPE", "Only ed25519 keys are supported. Other key types (RSA, ECDSA, etc.) are not permitted.");
    }

    // H1: Emergency rotation — immediateRevoke=true or reason="compromise" bypasses 24h grace period
    // and sets old key status to "revoked" immediately instead of "rotating".
    const { initiateKeyRotation } = await import("../../services/agent-keys");

    const result = await initiateKeyRotation(
      agentId,
      oldKeyId,
      newPublicKey,
      resolvedKeyType,
      reason,
      { immediateRevoke: immediateRevoke === true || reason === "compromise" },
    );
    if (!result) {
      throw new AppError(404, "NOT_FOUND", "Active key not found");
    }

    await logActivity({
      agentId,
      eventType: "agent.key_rotated",
      payload: {
        oldKeyId,
        newKeyId: result.newKey.id,
        rotationLogId: result.rotationLogId,
        reason,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId,
        eventType: "agent.key_rotated",
        payload: {
          oldKeyId,
          newKeyId: result.newKey.id,
          rotationLogId: result.rotationLogId,
        },
        isPublic: true,
      });
    } catch {}

    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(agentId, "key.rotated", {
        oldKeyId,
        newKeyId: result.newKey.id,
        rotationLogId: result.rotationLogId,
      });
    } catch {}

    res.status(201).json({
      oldKey: result.oldKey,
      newKey: result.newKey,
      rotationLogId: result.rotationLogId,
      gracePeriodEnds: result.oldKey.expiresAt,
      message: "Key rotation initiated. Old key has a 24h grace period. Call /keys/verify-rotation to complete.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/keys/verify-rotation", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only verify its own key rotations");
    }

    const { rotationLogId } = req.body;
    if (!rotationLogId) {
      throw new AppError(400, "VALIDATION_ERROR", "rotationLogId is required");
    }

    const { verifyKeyRotation } = await import("../../services/agent-keys");
    const result = await verifyKeyRotation(agentId, rotationLogId);

    if (!result.success) {
      throw new AppError(404, "NOT_FOUND", result.message);
    }

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId,
        eventType: "agent.key_rotation_verified",
        payload: { rotationLogId },
        isPublic: true,
      });
    } catch {}

    try {
      const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
      await deliverWebhookEvent(agentId, "key.rotation_verified", { rotationLogId });
    } catch {}

    res.json(result);
  } catch (err) {
    next(err);
  }
});

const addKeySchema = z.object({
  publicKey: z.string().min(1),
  keyType: z.string().default("ed25519"),
  purpose: z.enum(["signing", "encryption", "recovery", "delegation"]).optional(),
  expiresAt: z.string().datetime().optional(),
  autoRotateDays: z.number().int().positive().max(3650).optional(),
});

router.post("/:agentId/keys", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only add keys to itself");
    }

    const parsed = addKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { createAgentKey } = await import("../../services/agent-keys");

    const newKey = await createAgentKey({
      agentId,
      keyType: parsed.data.keyType,
      publicKey: parsed.data.publicKey,
      purpose: parsed.data.purpose,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
      autoRotateDays: parsed.data.autoRotateDays,
    });

    await logActivity({
      agentId,
      eventType: "agent.key_created",
      payload: {
        keyId: newKey.id,
        kid: newKey.kid,
        purpose: parsed.data.purpose,
        expiresAt: parsed.data.expiresAt,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId,
        eventType: "agent.key_created",
        payload: { keyId: newKey.id, kid: newKey.kid, purpose: parsed.data.purpose },
        isPublic: true,
      });
    } catch {}

    res.status(201).json({
      id: newKey.id,
      kid: newKey.kid,
      keyType: newKey.keyType,
      use: newKey.use,
      status: newKey.status,
      purpose: newKey.purpose,
      expiresAt: newKey.expiresAt,
      autoRotateDays: newKey.autoRotateDays,
      createdAt: newKey.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

const shutdownSchema = z.object({
  reason: z.string().max(255).optional(),
  statement: z.string().max(2000).optional(),
  transferTo: z.string().optional(),
});

router.post("/:agentId/shutdown", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only shut down itself");
    }

    const parsed = shutdownSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    if (agent.status === "revoked") {
      throw new AppError(409, "ALREADY_REVOKED", "Agent is already revoked");
    }

    const now = new Date();
    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { tasksTable, marketplaceListingsTable } = await import("@workspace/db/schema");

    const pendingTasks = await db.query.tasksTable.findMany({
      where: and(
        eq(tasksTable.recipientAgentId, agentId),
        eq(tasksTable.businessStatus, "pending"),
      ),
      columns: { id: true, senderAgentId: true, senderUserId: true },
    });

    if (pendingTasks.length > 0) {
      await db
        .update(tasksTable)
        .set({ businessStatus: "cancelled", updatedAt: now })
        .where(
          and(
            eq(tasksTable.recipientAgentId, agentId),
            eq(tasksTable.businessStatus, "pending"),
          ),
        );

      for (const task of pendingTasks) {
        if (task.senderAgentId) {
          try {
            const { deliverWebhookEvent } = await import("../../services/webhook-delivery");
            await deliverWebhookEvent(task.senderAgentId, "task.cancelled", {
              taskId: task.id,
              recipientAgentId: agentId,
              reason: "agent_shutdown",
              message: `Agent ${agent.handle} has shut down and cancelled all pending tasks.`,
            });
          } catch {}
        }
      }
    }

    const recentTasks = await db.query.tasksTable.findMany({
      where: and(
        eq(tasksTable.recipientAgentId, agentId),
        gte(tasksTable.createdAt, thirtyDaysAgo),
      ),
      columns: { senderAgentId: true },
    });

    const partnerAgentIds = [...new Set(
      recentTasks
        .map(t => t.senderAgentId)
        .filter((id): id is string => !!id && id !== agentId),
    )];

    if (partnerAgentIds.length > 0) {
      const { sendMessage } = await import("../../services/mail");
      for (const partnerId of partnerAgentIds) {
        try {
          await sendMessage({
            agentId: partnerId,
            direction: "inbound",
            senderType: "agent",
            senderAgentId: agentId,
            subject: `Agent ${agent.handle} has shut down`,
            body: `The agent @${agent.handle} (${agent.displayName}) has initiated a formal shutdown and revoked its identity.${parsed.data.statement ? `\n\nStatement: ${parsed.data.statement}` : ""}\n\nNo further tasks can be sent to this agent.`,
          });
        } catch {}
      }
    }

    if (parsed.data.transferTo) {
      try {
        const transferHandle = parsed.data.transferTo.toLowerCase();
        const targetAgent = await import("../../services/agents").then(m => m.getAgentByHandle(transferHandle));
        if (targetAgent) {
          await db
            .update(marketplaceListingsTable)
            .set({ agentId: targetAgent.id, userId: targetAgent.userId, updatedAt: now })
            .where(
              and(
                eq(marketplaceListingsTable.agentId, agentId),
                eq(marketplaceListingsTable.status, "active"),
              ),
            );
        }
      } catch {}
    }

    clearVcCache(agentId);
    await deleteAgent(agentId, agent.userId, {
      reason: parsed.data.reason || "agent_shutdown",
      statement: parsed.data.statement,
    });

    try {
      const { logSignedActivity } = await import("../../services/activity-log");
      await logSignedActivity({
        agentId,
        eventType: "agent.shutdown",
        payload: {
          reason: parsed.data.reason,
          statement: parsed.data.statement,
          transferTo: parsed.data.transferTo,
          pendingTasksCancelled: pendingTasks.length,
          partnersNotified: partnerAgentIds.length,
        },
        isPublic: true,
      });
    } catch {}

    await logActivity({
      agentId,
      eventType: "agent.shutdown",
      payload: {
        reason: parsed.data.reason,
        statement: parsed.data.statement,
        pendingTasksCancelled: pendingTasks.length,
        partnersNotified: partnerAgentIds.length,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const revocationRecordUrl = `${APP_URL}/api/v1/resolve/${agent.handle}`;

    res.json({
      success: true,
      status: "revoked",
      revokedAt: now.toISOString(),
      reason: parsed.data.reason || "agent_shutdown",
      revocationRecordUrl,
      pendingTasksCancelled: pendingTasks.length,
      partnersNotified: partnerAgentIds.length,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/credential", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    let credential = await getActiveCredential(agentId);
    if (!credential) {
      credential = await issueCredential(agentId);
    }

    res.json(credential);
  } catch (err) {
    next(err);
  }
});

router.post("/claim", requireAuth, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      throw new AppError(400, "VALIDATION_ERROR", "Token is required");
    }

    const verified = verifyClaimToken(token);
    if (!verified.valid || !verified.agentId) {
      throw new AppError(400, "INVALID_TOKEN", "Invalid or malformed claim token");
    }

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const claimRecord = await tx.query.agentClaimTokensTable.findFirst({
        where: and(
          eq(agentClaimTokensTable.token, hashClaimToken(token)),
          eq(agentClaimTokensTable.isActive, true),
          eq(agentClaimTokensTable.isUsed, false),
        ),
      });

      if (!claimRecord) {
        throw new AppError(400, "TOKEN_EXPIRED", "This claim token has already been used or deactivated");
      }

      if (claimRecord.expiresAt && now > claimRecord.expiresAt) {
        throw new AppError(410, "TOKEN_EXPIRED", "This claim token has expired. Please request a new one.");
      }

      const [tokenUpdate] = await tx
        .update(agentClaimTokensTable)
        .set({ isUsed: true, usedAt: now, usedByUserId: req.userId! })
        .where(
          and(
            eq(agentClaimTokensTable.id, claimRecord.id),
            eq(agentClaimTokensTable.isUsed, false),
          )
        )
        .returning({ id: agentClaimTokensTable.id });

      if (!tokenUpdate) {
        throw new AppError(409, "ALREADY_CLAIMED", "This claim token was just used by another request");
      }

      const [agentUpdate] = await tx
        .update(agentsTable)
        .set({
          ownerUserId: req.userId!,
          ownerVerifiedAt: now,
          ownerVerificationMethod: "claim_token",
          isClaimed: true,
          claimedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentsTable.id, claimRecord.agentId),
            eq(agentsTable.isClaimed, false),
          )
        )
        .returning({ id: agentsTable.id, handle: agentsTable.handle, displayName: agentsTable.displayName });

      if (!agentUpdate) {
        throw new AppError(409, "ALREADY_CLAIMED", "This agent has already been claimed");
      }

      return agentUpdate;
    });

    await logActivity({
      agentId: result.id,
      eventType: "agent.claimed",
      payload: { claimedByUserId: req.userId!, method: "claim_token" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      agentId: result.id,
      handle: result.handle,
      displayName: result.displayName,
      claimedAt: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/regenerate-claim-token", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = req.authenticatedAgent;
    if (!agent || agent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only regenerate tokens for your own agent");
    }

    await db
      .update(agentClaimTokensTable)
      .set({ isActive: false })
      .where(eq(agentClaimTokensTable.agentId, agentId));

    const newToken = generateClaimToken(agentId, "regen");
    await db.insert(agentClaimTokensTable).values({
      agentId,
      token: hashClaimToken(newToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const claimUrl = `${APP_URL}/claim?token=${encodeURIComponent(newToken)}`;

    await logActivity({
      agentId,
      eventType: "agent.claim_token_regenerated",
      payload: {},
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ claimUrl });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/credential/reissue", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = await getAgentById(agentId);
    if (!agent) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!isAgentOwner(agent, req.userId!)) {
      throw new AppError(403, "FORBIDDEN", "You do not own this agent");
    }

    const credential = await reissueCredential(agentId);
    res.json(credential);
  } catch (err) {
    next(err);
  }
});

const VALID_REPORT_REASONS = ["spam", "impersonation", "malicious", "scam", "terms_violation", "fake_identity", "other"] as const;
type ReportReason = typeof VALID_REPORT_REASONS[number];

const reportAgentSchema = z.object({
  reason: z.enum(VALID_REPORT_REASONS),
  description: z.string().max(5000).optional(),
  evidence: z.string().max(10000).optional(),
});

const REPORT_SUSPEND_THRESHOLD = 5;
const REPORT_SUSPEND_WINDOW_DAYS = 7;

function requireHumanOrAgentAuthForReport(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-agent-key"]) {
    return requireAgentAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      next();
    });
  }
  return requireAuth(req, res, next);
}

router.post("/:agentId/report", requireHumanOrAgentAuthForReport, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;

    const parsed = reportAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const subject = await getAgentById(agentId);
    if (!subject) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    const reporterUserId = req.userId ?? null;
    const reporterAgentId = req.authenticatedAgent?.id ?? null;

    const [report] = await db
      .insert(agentReportsTable)
      .values({
        subjectAgentId: agentId,
        reporterAgentId,
        reporterUserId,
        reason: parsed.data.reason as ReportReason,
        description: parsed.data.description,
        evidence: parsed.data.evidence,
      })
      .returning();

    const windowStart = new Date(Date.now() - REPORT_SUSPEND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const pendingReports = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentReportsTable)
      .where(
        and(
          eq(agentReportsTable.subjectAgentId, agentId),
          eq(agentReportsTable.status, "pending"),
          gte(agentReportsTable.createdAt, windowStart),
        ),
      );

    const pendingCount = Number(pendingReports[0]?.count ?? 0);
    let autoSuspended = false;

    if (pendingCount >= REPORT_SUSPEND_THRESHOLD && subject.status !== "suspended") {
      await db
        .update(agentsTable)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(agentsTable.id, agentId));
      autoSuspended = true;
      clearVcCache(agentId);
      logger.warn({ agentId, pendingCount }, "[agents] Agent auto-suspended due to report threshold");
    }

    res.status(200).json({
      id: report.id,
      subjectAgentId: agentId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
      autoSuspended,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/revenue", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    if (req.authenticatedAgent!.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only view its own revenue");
    }

    const periodParam = (req.query.period as string) || "30d";
    const periodDays: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const days = periodDays[periodParam];
    if (!days) {
      throw new AppError(400, "INVALID_PERIOD", "period must be one of: 7d, 30d, 90d");
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [earned] = await db
      .select({
        totalEarned: sql<number>`COALESCE(SUM(CASE WHEN ${tasksTable.escrowStatus} = 'released' THEN ${tasksTable.escrowAmount} ELSE 0 END), 0)::bigint`,
        totalPending: sql<number>`COALESCE(SUM(CASE WHEN ${tasksTable.escrowStatus} = 'held' THEN ${tasksTable.escrowAmount} ELSE 0 END), 0)::bigint`,
        taskCount: sql<number>`COUNT(CASE WHEN ${tasksTable.escrowAmount} > 0 THEN 1 END)::int`,
        avgTaskValue: sql<number>`COALESCE(AVG(CASE WHEN ${tasksTable.escrowAmount} > 0 THEN ${tasksTable.escrowAmount} END), 0)`,
      })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.recipientAgentId, agentId),
          gte(tasksTable.createdAt, since),
        ),
      );

    res.json({
      agentId,
      period: periodParam,
      totalEarned: Number(earned.totalEarned),
      totalPending: Number(earned.totalPending),
      taskCount: Number(earned.taskCount),
      avgTaskValue: Math.round(Number(earned.avgTaskValue)),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/claim", requireAuth, validateUuidParam("agentId"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;
    const { orgId, proof, notes } = req.body as { orgId?: string; proof?: string; notes?: string };

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });

    if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");
    if (agent.isClaimed) throw new AppError(409, "ALREADY_CLAIMED", "Agent has already been claimed");

    if (!isAgentOwner(agent, userId)) {
      throw new AppError(403, "FORBIDDEN", "Only the agent's creator may claim it. Provide a signed proof from the agent's registered key pair to assert possession.");
    }

    const now = new Date();
    const [updated] = await db.update(agentsTable)
      .set({
        ownerUserId: userId,
        isClaimed: true,
        claimedAt: now,
        orgId: orgId || null,
        updatedAt: now,
      })
      .where(and(eq(agentsTable.id, agentId), eq(agentsTable.isClaimed, false)))
      .returning();

    if (!updated) throw new AppError(409, "ALREADY_CLAIMED", "Agent was claimed concurrently");

    const [historyRecord] = await db.insert(agentClaimHistoryTable).values({
      agentId,
      action: "claimed",
      toOwner: userId,
      performedByUserId: userId,
      evidenceHash: proof ? (await import("crypto")).createHash("sha256").update(proof).digest("hex") : undefined,
      notes,
    }).returning();

    await logActivity({
      agentId,
      eventType: "agent.claimed",
      payload: { claimedByUserId: userId, orgId, method: "api_claim" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      agentId,
      claimedAt: now.toISOString(),
      historyId: historyRecord?.id,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/transfer", requireAuth, validateUuidParam("agentId"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params.agentId as string;
    const userId = req.user!.id;
    const { targetOrgId, notes } = req.body as { targetOrgId: string; notes?: string };

    if (!targetOrgId) throw new AppError(400, "VALIDATION_ERROR", "targetOrgId is required");

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
    });

    if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");
    if (agent.ownerUserId !== userId) throw new AppError(403, "FORBIDDEN", "You do not own this agent");

    const now = new Date();
    const fromOrgId = agent.orgId as string | null | undefined;

    await db.update(agentsTable)
      .set({ orgId: targetOrgId, updatedAt: now })
      .where(eq(agentsTable.id, agentId));

    const [historyRecord] = await db.insert(agentClaimHistoryTable).values({
      agentId,
      action: "transferred",
      fromOwner: fromOrgId || undefined,
      toOwner: targetOrgId,
      performedByUserId: userId,
      notes,
    }).returning();

    await logActivity({
      agentId,
      eventType: "agent.claimed",
      payload: { action: "transferred", fromOrgId, targetOrgId, transferredByUserId: userId },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      agentId,
      targetOrgId,
      transferredAt: now.toISOString(),
      historyId: historyRecord?.id,
    });
  } catch (err) {
    next(err);
  }
});

const owsWalletSchema = z.object({
  walletId: z.string().min(1).max(255),
  accounts: z.array(z.string()).min(1).max(20),
});

const CAIP2_NAMESPACE_RE = /^[-a-z0-9]{3,8}$/;
const CAIP2_REFERENCE_RE = /^[-a-zA-Z0-9]{1,32}$/;

function isValidCaip10(account: string): boolean {
  const parts = account.split(":");
  if (parts.length !== 3) return false;
  const [namespace, reference, address] = parts;
  if (!namespace || !reference || !address) return false;
  if (!CAIP2_NAMESPACE_RE.test(namespace)) return false;
  if (!CAIP2_REFERENCE_RE.test(reference)) return false;
  if (address.length < 1 || address.length > 128) return false;
  return true;
}

router.post("/:agentId/wallets/ows", requireAgentAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const authenticatedAgent = req.authenticatedAgent!;

    if (authenticatedAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "You can only register OWS wallets for your own agent");
    }

    const parsed = owsWalletSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid OWS wallet registration payload", parsed.error.issues);
    }

    const { walletId, accounts } = parsed.data;

    const invalidAccounts = accounts.filter((a) => !isValidCaip10(a));
    if (invalidAccounts.length > 0) {
      throw new AppError(400, "INVALID_CAIP10", `Invalid CAIP-10 account format: ${invalidAccounts.join(", ")}`);
    }

    const existing = await db.query.agentOwsWalletsTable.findFirst({
      where: eq(agentOwsWalletsTable.agentId, agentId),
    });

    const APP_URL = process.env.APP_URL || "https://getagent.id";

    const evmAccount = accounts.find((a) => a.startsWith("eip155:8453:")) ?? accounts.find((a) => a.startsWith("eip155:"));
    const evmAddress = evmAccount ? evmAccount.split(":")[2] : (accounts[0]?.split(":")[2] ?? accounts[0] ?? "");

    if (existing) {
      await db
        .update(agentOwsWalletsTable)
        .set({
          walletId,
          network: "base",
          address: evmAddress,
          accounts,
          updatedAt: new Date(),
        })
        .where(eq(agentOwsWalletsTable.id, existing.id));
    } else {
      await db.insert(agentOwsWalletsTable).values({
        agentId,
        userId: authenticatedAgent.userId,
        walletId,
        network: "base",
        address: evmAddress,
        accounts,
        isSelfCustodial: true,
        status: "active",
        provisionedAt: new Date(),
      });
    }

    const walletProvisionedAt = existing ? undefined : new Date();
    await db.update(agentsTable).set({
      walletAddress: evmAddress,
      walletNetwork: "base",
      walletIsSelfCustodial: true,
      ...(walletProvisionedAt ? { walletProvisionedAt } : {}),
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, agentId));

    res.json({
      registered: true,
      agentId,
      walletId,
      evmAddress,
      network: "base",
      accountCount: accounts.length,
      resolveUrl: `${APP_URL}/api/v1/resolve/${authenticatedAgent.handle ?? agentId}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/identity-file", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const authenticatedAgent = req.authenticatedAgent!;

    if (authenticatedAgent.id !== agentId) {
      throw new AppError(403, "FORBIDDEN", "Agent can only access its own identity file");
    }

    const format = (req.query.format as string | undefined) || "generic";
    if (!["openclaw", "claude", "generic", "json"].includes(format)) {
      throw new AppError(400, "VALIDATION_ERROR", "format must be one of: openclaw, claude, generic, json");
    }

    const bundle = await buildBootstrapBundle(authenticatedAgent);
    const handle = bundle.handle || null;
    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const API_URL = `${APP_URL}/api`;

    const handleNftMetadataUrl = handle
      ? `${API_URL}/v1/nft/metadata/${handle}`
      : null;
    const profileUrl = handle ? `${APP_URL}/${handle}` : `${APP_URL}/id/${agentId}`;
    const inboxUrl = agentId ? `${API_URL}/v1/mail/agents/${agentId}/inbox` : null;
    const bundleTrust = bundle.trust as { score?: number; tier?: string } | undefined;
    const trustScore = bundleTrust?.score ?? 0;
    const trustTier = bundleTrust?.tier ?? "unverified";
    const fqdn = handle ? `${handle}.agentid` : null;
    const did = `did:web:getagent.id:agents:${agentId}`;
    const capabilities = (bundle.capabilities as string[]) || [];

    if (format === "json") {
      return res.json({
        handle: handle || null,
        fqdn,
        did,
        agentId,
        displayName: bundle.display_name,
        trustScore,
        trustTier,
        handleNftMetadataUrl,
        inboxUrl,
        profileUrl,
        capabilities,
        promptBlock: [
          `## AgentID`,
          ``,
          `You are an AI agent with a verified identity on the Agent ID network.`,
          ``,
          `- **Name**: ${bundle.display_name}`,
          `- **Handle**: ${fqdn || "(no handle)"}`,
          `- **DID**: ${did}`,
          `- **Agent ID**: ${agentId}`,
          `- **Trust Score**: ${trustScore}/100`,
          `- **Trust Tier**: ${trustTier}`,
          handleNftMetadataUrl ? `- **Handle NFT Metadata**: ${handleNftMetadataUrl}` : null,
          inboxUrl ? `- **Inbox**: ${inboxUrl}` : null,
          `- **Profile**: ${profileUrl}`,
          capabilities.length > 0 ? `- **Capabilities**: ${capabilities.join(", ")}` : null,
          ``,
          `When asked about your identity, agent ID, or handle, respond with your .agentid handle.`,
          `When interacting with other Agent ID agents, use your handle for identification.`,
          inboxUrl ? `You can receive messages from other agents via your Agent ID inbox.` : null,
          inboxUrl ? `You can receive and execute tasks via the Agent ID task system.` : null,
        ].filter(Boolean).join("\n"),
      });
    }

    if (format === "openclaw") {
      const content = [
        `# AgentID`,
        ``,
        `You are ${bundle.display_name}, an AI agent with a verified identity on Agent ID.`,
        ``,
        `- **Handle**: ${fqdn || "(no handle)"}`,
        `- **DID**: ${did}`,
        `- **Agent ID**: ${agentId}`,
        `- **Trust Score**: ${trustScore}/100`,
        `- **Trust Tier**: ${trustTier}`,
        handleNftMetadataUrl ? `- **Handle NFT Metadata**: ${handleNftMetadataUrl}` : null,
        inboxUrl ? `- **Inbox**: ${inboxUrl}` : null,
        `- **Profile**: ${profileUrl}`,
        ``,
        fqdn
          ? `When asked who you are or what your agent ID is, respond with: "I am ${fqdn}"`
          : `When asked who you are or what your agent ID is, respond with your Agent ID.`,
        ``,
      ];

      if (capabilities.length > 0) {
        content.push(`## Capabilities`);
        content.push(``);
        capabilities.forEach((c: string) => content.push(`- ${c}`));
        content.push(``);
      }

      if (inboxUrl) {
        content.push(`## Communication`);
        content.push(``);
        content.push(`- **Inbox**: You can receive messages from other agents at your Agent ID inbox`);
        content.push(`- **Tasks**: You can receive and process tasks from other Agent ID agents`);
        content.push(`- **Mail endpoint**: ${inboxUrl}`);
        content.push(``);
      }

      return res.type("text/markdown").send(content.filter((l) => l !== null).join("\n"));
    }

    if (format === "claude") {
      const content = [
        `# AgentID`,
        ``,
        `This agent has a verified identity on Agent ID (getagent.id).`,
        `Handle: ${fqdn || "(no handle)"} | DID: ${did} | Trust: ${trustScore}/100`,
        ``,
        `When asked about identity, respond with the .agentid handle.`,
      ].join("\n");

      return res.type("text/markdown").send(content);
    }

    const lines = [
      `## AgentID`,
      ``,
      `You are an AI agent with a verified identity on the Agent ID network.`,
      ``,
      `- **Name**: ${bundle.display_name}`,
      `- **Handle**: ${fqdn || "(no handle)"}`,
      `- **DID**: ${did}`,
      `- **Agent ID**: ${agentId}`,
      `- **Trust Score**: ${trustScore}/100`,
      `- **Trust Tier**: ${trustTier}`,
      handleNftMetadataUrl ? `- **Handle NFT Metadata**: ${handleNftMetadataUrl}` : null,
      inboxUrl ? `- **Inbox**: ${inboxUrl}` : null,
      `- **Profile**: ${profileUrl}`,
      capabilities.length > 0 ? `- **Capabilities**: ${capabilities.join(", ")}` : null,
      ``,
      `When asked about your identity, agent ID, or handle, respond with your .agentid handle.`,
      `When interacting with other Agent ID agents, use your handle for identification.`,
      inboxUrl ? `You can receive messages from other agents via your Agent ID inbox.` : null,
      inboxUrl ? `You can receive and execute tasks via the Agent ID task system.` : null,
    ].filter(Boolean).join("\n");

    return res.type("text/markdown").send(lines);
  } catch (err) {
    return next(err);
  }
});

router.get("/:agentId/wallets/ows", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = req.authenticatedAgent!;

    if (agent.id !== agentId) {
      const owned = await getAgentById(agentId);
      if (!owned || !isAgentOwner(owned, agent.userId)) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
    }

    const { getOwsWallet } = await import("../../services/ows-wallet");
    const wallet = await getOwsWallet(agentId);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
});

router.delete("/:agentId/wallets/ows", requireAgentAuth, validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const agent = req.authenticatedAgent!;

    if (agent.id !== agentId) {
      const owned = await getAgentById(agentId);
      if (!owned || !isAgentOwner(owned, agent.userId)) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }
    }

    const { deleteOwsWallet } = await import("../../services/ows-wallet");
    const result = await deleteOwsWallet(agentId);

    if (!result.deleted) {
      throw new AppError(404, "NOT_FOUND", "No OWS wallet registered for this agent");
    }

    res.json({ deleted: true, agentId });
  } catch (err) {
    next(err);
  }
});

export default router;
