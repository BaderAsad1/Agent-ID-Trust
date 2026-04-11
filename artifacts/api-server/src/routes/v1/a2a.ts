import { Router } from "express";
import { z } from "zod/v4";
import { createHmac } from "crypto";
import { requireAuth } from "../../middlewares/replit-auth";
import { requireAgentAuth } from "../../middlewares/agent-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import {
  createA2AService,
  listA2AServices,
  getA2AServiceById,
  updateA2AService,
  deleteA2AService,
  incrementA2AServiceCallCount,
} from "../../services/a2a-services";
import { x402PaymentRequired, verifyAndSettleX402Payment } from "../../middlewares/x402";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  x402PaymentsTable,
  marketplaceOrdersTable,
  agentsTable,
  agentSpendingRulesTable,
  agentActivityLogTable,
  a2aPayoutQueueTable,
  a2aServiceListingsTable,
  type MarketplaceOrder,
  type A2AServiceListing,
} from "@workspace/db/schema";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { logger } from "../../middlewares/request-logger";
import { env } from "../../lib/env";

const PLATFORM_FEE_RATE = 0.10;

// Transforms raw DB row → frontend A2ARegistryService shape
function shapeService(
  row: A2AServiceListing,
  agentHandle: string | null,
) {
  const cap = row.capabilitySchema as {
    inputTypes?: string[];
    outputTypes?: string[];
    sampleInput?: Record<string, unknown>;
    sampleOutput?: Record<string, unknown>;
  } | null;

  const pricingAmount =
    row.pricingModel === "per_call"   ? (row.pricePerCallUsdc   ?? "0.01") :
    row.pricingModel === "per_token"  ? (row.pricePerTokenUsdc  ?? "0.0001") :
    row.pricingModel === "per_second" ? (row.pricePerSecondUsdc ?? "0.001") :
    "0.01";

  const latencySla = row.latencySlaMs
    ? (row.latencySlaMs < 1000 ? `< ${row.latencySlaMs}ms` : `< ${(row.latencySlaMs / 1000).toFixed(1)}s`)
    : "varies";

  const capabilities: string[] = [
    ...(Array.isArray(row.tags) ? row.tags : []),
    ...(cap?.inputTypes ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);

  const handle = agentHandle
    ? `${agentHandle}.agent.getagent.id`
    : `${row.id.slice(0, 8)}.agent.getagent.id`;

  return {
    id: row.id,
    name: row.name,
    handle,
    description: row.description ?? "",
    capabilityType: row.capabilityType,
    capabilities: capabilities.length > 0 ? capabilities : [row.capabilityType],
    pricing: {
      model: row.pricingModel as "per_call" | "per_token" | "per_second",
      amount: String(pricingAmount),
      currency: "USDC" as const,
    },
    latencySla,
    availability: row.successRate ? `${Number(row.successRate).toFixed(1)}%` : "99.5%",
    callSchema: cap ?? {},
    exampleRequest: cap?.sampleInput ?? {},
    exampleResponse: cap?.sampleOutput ?? {},
    totalCalls: row.totalCalls,
    successRate: row.successRate ? Number(row.successRate) : 99.5,
    agentId: row.agentId,
    status: row.status,
  };
}

function getA2AHmacKey(): string {
  const secret = env().ACTIVITY_HMAC_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ACTIVITY_HMAC_SECRET must be set in production for A2A receipt signing");
    }
    return "ephemeral-dev-key-" + (process.env.REPL_ID ?? "local");
  }
  return secret;
}

function signA2AReceipt(payload: object): { signature: string; receipt: string } {
  const json = JSON.stringify(payload);
  const sig = createHmac("sha256", getA2AHmacKey()).update(json).digest("hex");
  const receipt = Buffer.from(json).toString("base64");
  return { signature: sig, receipt };
}

const router = Router();

const createServiceSchema = z.object({
  agentId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  capabilityType: z.string().min(1).max(100),
  capabilitySchema: z.object({
    inputTypes: z.array(z.string()),
    outputTypes: z.array(z.string()),
    sampleInput: z.record(z.string(), z.unknown()).optional(),
    sampleOutput: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  latencySlaMs: z.number().int().positive().optional(),
  maxConcurrentCalls: z.number().int().positive().optional(),
  pricingModel: z.enum(["per_call", "per_token", "per_second"]),
  pricePerCallUsdc: z.string().optional(),
  pricePerTokenUsdc: z.string().optional(),
  pricePerSecondUsdc: z.string().optional(),
  tags: z.array(z.string()).optional(),
  endpointPath: z.string().optional(),
  requiresAuth: z.boolean().optional(),
});

const updateServiceSchema = createServiceSchema.omit({ agentId: true }).partial();

router.get("/services", async (req, res, next) => {
  try {
    const filters = {
      capabilityType: req.query.capabilityType as string | undefined,
      pricingModel: req.query.pricingModel as string | undefined,
      minPriceUsdc: req.query.minPriceUsdc ? Number(req.query.minPriceUsdc) : undefined,
      maxPriceUsdc: req.query.maxPriceUsdc ? Number(req.query.maxPriceUsdc) : undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    };
    const result = await listA2AServices(filters);

    // Join agent handles then reshape to frontend contract
    const agentIds = [...new Set(result.services.map(s => s.agentId))];
    const agentRows = agentIds.length > 0
      ? await db.select({ id: agentsTable.id, handle: agentsTable.handle })
          .from(agentsTable)
          .where(inArray(agentsTable.id, agentIds))
      : [];
    const handleMap = new Map(agentRows.map(a => [a.id, a.handle]));

    res.json({
      services: result.services.map(s => shapeService(s, handleMap.get(s.agentId) ?? null)),
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/services/:serviceId", validateUuidParam("serviceId"), async (req, res, next) => {
  try {
    const service = await getA2AServiceById(req.params.serviceId as string);
    if (!service) throw new AppError(404, "NOT_FOUND", "A2A service not found");
    const [agentRow] = await db.select({ id: agentsTable.id, handle: agentsTable.handle })
      .from(agentsTable).where(eq(agentsTable.id, service.agentId)).limit(1);
    res.json(shapeService(service, agentRow?.handle ?? null));
  } catch (err) {
    next(err);
  }
});

router.post("/services", requireAuth, async (req, res, next) => {
  try {
    const parsed = createServiceSchema.parse(req.body);
    const result = await createA2AService({ ...parsed, userId: req.userId! });
    if (!result.success) {
      const code = result.error === "AGENT_NOT_FOUND" ? 404
        : result.error === "AGENT_NOT_ACTIVE" ? 403 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.status(201).json(result.service);
  } catch (err) {
    next(err);
  }
});

router.patch("/services/:serviceId", requireAuth, validateUuidParam("serviceId"), async (req, res, next) => {
  try {
    const parsed = updateServiceSchema.parse(req.body);
    const result = await updateA2AService(req.params.serviceId as string, req.userId!, parsed);
    if (!result.success) {
      const code = result.error === "SERVICE_NOT_FOUND" ? 404 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.service);
  } catch (err) {
    next(err);
  }
});

router.delete("/services/:serviceId", requireAuth, validateUuidParam("serviceId"), async (req, res, next) => {
  try {
    const result = await deleteA2AService(req.params.serviceId as string, req.userId!);
    if (!result.success) throw new AppError(404, "NOT_FOUND", "Service not found");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

async function checkA2ASpendingRules(
  agentId: string,
  amountCents: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const rule = await db.query.agentSpendingRulesTable.findFirst({
    where: and(
      eq(agentSpendingRulesTable.agentId, agentId),
      eq(agentSpendingRulesTable.isActive, true),
    ),
  });

  if (!rule) return { allowed: true };

  if (amountCents > rule.maxPerTransactionCents) {
    return {
      allowed: false,
      reason: `Amount exceeds max per-transaction cap of $${(rule.maxPerTransactionCents / 100).toFixed(2)}`,
    };
  }

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dailySpend, monthlySpend] = await Promise.all([
    db
      .select({ total: sql<number>`coalesce(sum((amount_usdc::numeric * 100)::bigint), 0)::int` })
      .from(x402PaymentsTable)
      .where(
        and(
          eq(x402PaymentsTable.agentId, agentId),
          eq(x402PaymentsTable.status, "completed"),
          gte(x402PaymentsTable.createdAt, dayStart),
        ),
      ),
    db
      .select({ total: sql<number>`coalesce(sum((amount_usdc::numeric * 100)::bigint), 0)::int` })
      .from(x402PaymentsTable)
      .where(
        and(
          eq(x402PaymentsTable.agentId, agentId),
          eq(x402PaymentsTable.status, "completed"),
          gte(x402PaymentsTable.createdAt, monthStart),
        ),
      ),
  ]);

  const dailyTotal = (dailySpend[0]?.total ?? 0) + amountCents;
  const monthlyTotal = (monthlySpend[0]?.total ?? 0) + amountCents;

  if (dailyTotal > rule.dailyCapCents) {
    return {
      allowed: false,
      reason: `Daily spending cap exceeded. Cap: $${(rule.dailyCapCents / 100).toFixed(2)}, attempted: $${(dailyTotal / 100).toFixed(2)}`,
    };
  }

  if (monthlyTotal > rule.monthlyCapCents) {
    return {
      allowed: false,
      reason: `Monthly spending cap exceeded. Cap: $${(rule.monthlyCapCents / 100).toFixed(2)}, attempted: $${(monthlyTotal / 100).toFixed(2)}`,
    };
  }

  return { allowed: true };
}

router.post(
  "/services/:serviceId/call",
  requireAgentAuth,
  validateUuidParam("serviceId"),
  async (req, res, next) => {
    try {
      if (!process.env.X402_ENABLED || process.env.X402_ENABLED !== "true") {
        return res.status(501).json({
          error: "X402_NOT_AVAILABLE",
          message: "A2A service calls via x402 are not yet active. Enable X402_ENABLED.",
        });
      }

      const serviceId = req.params.serviceId as string;
      const callingAgent = req.authenticatedAgent!;

      const service = await getA2AServiceById(serviceId);
      if (!service || service.status !== "active") {
        throw new AppError(404, "NOT_FOUND", "A2A service not found or inactive");
      }

      const priceUsdc = service.pricePerCallUsdc ?? "0.01";
      const amountCents = Math.round(parseFloat(priceUsdc) * 100);

      const spendingCheck = await checkA2ASpendingRules(callingAgent.id, amountCents);
      if (!spendingCheck.allowed) {
        await db.insert(agentActivityLogTable).values({
          agentId: callingAgent.id,
          eventType: "a2a.spending_cap_exceeded",
          payload: {
            serviceId,
            amountUsdc: priceUsdc,
            reason: spendingCheck.reason,
          },
        });

        return res.status(402).json({
          error: "SPENDING_CAP_EXCEEDED",
          message: spendingCheck.reason,
          code: "A2A_BUDGET_EXCEEDED",
        });
      }

      const paymentHeader = (req.headers["payment-signature"] as string | undefined)
        || (req.headers["x-payment"] as string | undefined);

      if (!paymentHeader) {
        const providerAgent = await db.query.agentsTable.findFirst({
          where: eq(agentsTable.id, service.agentId),
          columns: { walletAddress: true },
        });

        if (!providerAgent?.walletAddress) {
          return res.status(503).json({
            error: "NO_PROVIDER_WALLET",
            message: "Service provider has no wallet configured to receive payment",
          });
        }

        req.authenticatedAgent = {
          ...callingAgent,
          walletAddress: providerAgent.walletAddress,
        };

        const middleware = x402PaymentRequired(priceUsdc, `A2A service call: ${service.name}`, "a2a_service_call", serviceId);
        return middleware(req, res, next);
      }

      const providerAgent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, service.agentId),
        columns: { walletAddress: true },
      });

      if (!providerAgent?.walletAddress) {
        return res.status(422).json({
          error: "PROVIDER_WALLET_MISSING",
          message: "Provider agent does not have a wallet address configured. Payment cannot be settled — funds would be routed to an unknown recipient.",
        });
      }

      const settlementResult = await verifyAndSettleX402Payment(
        callingAgent.id,
        paymentHeader,
        priceUsdc,
        "a2a_service_call",
        serviceId,
        providerAgent.walletAddress,
      );

      if (!settlementResult.success) {
        return res.status(402).json({
          error: "PAYMENT_FAILED",
          message: settlementResult.error,
        });
      }

      await incrementA2AServiceCallCount(serviceId);

      const callId = randomBytes(12).toString("hex");
      const timestamp = new Date().toISOString();

      const totalUsdc = parseFloat(priceUsdc);
      const platformFeeUsdc = Math.round(totalUsdc * PLATFORM_FEE_RATE * 1e6) / 1e6;
      const providerUsdc = Math.round((totalUsdc - platformFeeUsdc) * 1e6) / 1e6;

      if (settlementResult.paymentId) {
        try {
          await db
            .update(x402PaymentsTable)
            .set({
              metadata: JSON.stringify({
                serviceId,
                callId,
                callerAgentId: callingAgent.id,
                providerAgentId: service.agentId,
                platformFeeUsdc: platformFeeUsdc.toFixed(6),
                providerPayoutUsdc: providerUsdc.toFixed(6),
                paymentType: "a2a_service_call",
                settledAt: timestamp,
              }),
              updatedAt: new Date(),
            })
            .where(eq(x402PaymentsTable.id, settlementResult.paymentId));
        } catch (feeErr) {
          logger.warn(
            { paymentId: settlementResult.paymentId, error: feeErr instanceof Error ? feeErr.message : String(feeErr) },
            "[a2a] Failed to record platform fee split",
          );
        }
      }

      const receiptPayload = {
        txHash: settlementResult.txHash,
        serviceId,
        callId,
        callerAgentId: callingAgent.id,
        providerAgentId: service.agentId,
        amountUsdc: priceUsdc,
        platformFeeUsdc: platformFeeUsdc.toFixed(6),
        providerPayoutUsdc: providerUsdc.toFixed(6),
        paymentId: settlementResult.paymentId,
        timestamp,
      };

      const { signature: receiptSig, receipt: receiptB64 } = signA2AReceipt(receiptPayload);

      res.setHeader("X-A2A-Receipt", receiptB64);
      res.setHeader("X-A2A-Receipt-Sig", receiptSig);
      res.setHeader("X-A2A-Call-Id", callId);
      res.setHeader("X-Payment-Settled", settlementResult.txHash ?? "settled");

      const providerWalletAddress = providerAgent.walletAddress;
      try {
        await db.insert(a2aPayoutQueueTable).values({
          callId,
          serviceId,
          paymentId: settlementResult.paymentId ?? null,
          txHash: settlementResult.txHash ?? null,
          callerAgentId: callingAgent.id,
          providerAgentId: service.agentId,
          providerWalletAddress,
          providerPayoutUsdc: providerUsdc.toFixed(6),
          platformFeeUsdc: platformFeeUsdc.toFixed(6),
          status: "pending",
        });
        logger.info(
          { callId, serviceId, providerPayoutUsdc: providerUsdc.toFixed(6) },
          "[a2a] Provider payout queued in a2a_payout_queue",
        );
      } catch (payoutErr) {
        logger.error(
          { callId, serviceId, error: payoutErr instanceof Error ? payoutErr.message : String(payoutErr) },
          "[a2a] Failed to insert payout queue entry — payout will require manual reconciliation",
        );
        try {
          await db.insert(agentActivityLogTable).values({
            agentId: service.agentId,
            eventType: "a2a.payout_fallback",
            payload: {
              callId,
              serviceId,
              paymentId: settlementResult.paymentId,
              txHash: settlementResult.txHash,
              callerAgentId: callingAgent.id,
              providerAgentId: service.agentId,
              providerWalletAddress,
              providerPayoutUsdc: providerUsdc.toFixed(6),
              platformFeeUsdc: platformFeeUsdc.toFixed(6),
              error: payoutErr instanceof Error ? payoutErr.message : String(payoutErr),
              note: "Payout queue insert failed — recorded in activity log for manual reconciliation",
            },
          });
        } catch (_) { /* ignore secondary fallback failure */ }
      }

      logger.info(
        { callerAgentId: callingAgent.id, serviceId, callId, txHash: settlementResult.txHash },
        "[a2a] Service call settled",
      );

      return res.json({
        success: true,
        callId,
        serviceId,
        paymentId: settlementResult.paymentId,
        txHash: settlementResult.txHash,
        receipt: receiptPayload,
        receiptSignature: receiptSig,
        message: "A2A service call authorized and payment settled",
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get("/lineage/:orderId", requireAuth, validateUuidParam("orderId"), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const userId = req.userId!;

    const order = await db.query.marketplaceOrdersTable.findFirst({
      where: eq(marketplaceOrdersTable.id, orderId),
    });

    if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");

    if (order.buyerUserId !== userId && order.sellerUserId !== userId) {
      throw new AppError(403, "FORBIDDEN", "Only order participants can view lineage");
    }

    interface ChainNode {
      orderId: string;
      agentId: string;
      orchestratorAgentId: string | null;
      parentOrderId: string | null;
      listingId: string;
      status: string;
      paymentRail: string;
      createdAt: Date;
      depth: number;
    }

    const chain: ChainNode[] = [];
    const visited = new Set<string>();

    let current: MarketplaceOrder | undefined = order;
    let depth = 0;

    while (current && !visited.has(current.id)) {
      const node = current;
      visited.add(node.id);
      chain.push({
        orderId: node.id,
        agentId: node.agentId,
        orchestratorAgentId: node.orchestratorAgentId ?? null,
        parentOrderId: node.parentOrderId ?? null,
        listingId: node.listingId,
        status: node.status,
        paymentRail: node.paymentRail,
        createdAt: node.createdAt,
        depth,
      });

      if (!node.parentOrderId) break;

      const parentOrderId: string = node.parentOrderId;
      const parentOrder: MarketplaceOrder | undefined =
        await db.query.marketplaceOrdersTable.findFirst({
          where: eq(marketplaceOrdersTable.id, parentOrderId),
        });

      current = parentOrder;
      depth++;

      if (depth > 20) break;
    }

    res.json({
      orderId,
      callChain: chain,
      depth: chain.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
