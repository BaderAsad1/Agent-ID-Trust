import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { x402PaymentsTable, agentsTable } from "@workspace/db/schema";
import { USDC_CONTRACT_ADDRESS, NETWORK_ID, BASE_EXPLORER_URL } from "../lib/cdp";
import { logger } from "../middlewares/request-logger";
import { checkSpendingLimits } from "../services/wallet";

export interface X402PaymentRequirement {
  x402Version: 1;
  accepts: Array<{
    scheme: "exact";
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    extra: Record<string, unknown>;
  }>;
  error?: string;
}

const APP_URL = () => process.env.APP_URL || "https://getagent.id";

function buildPaymentRequirements(
  amountUsdc: string,
  description: string,
  type: string,
  payTo: string,
  idempotencyKey: string,
  agentId?: string,
  resourceId?: string,
): X402PaymentRequirement {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: NETWORK_ID,
        maxAmountRequired: amountUsdc,
        resource: `${APP_URL()}/api/v1/pay/${type}${resourceId ? `/${resourceId}` : ""}`,
        description,
        mimeType: "application/json",
        payTo,
        maxTimeoutSeconds: 300,
        asset: USDC_CONTRACT_ADDRESS,
        extra: {
          agentId,
          idempotencyKey,
          basescanUrl: BASE_EXPLORER_URL,
          usdcContract: USDC_CONTRACT_ADDRESS,
        },
      },
    ],
  };
}

export function x402PaymentRequired(
  amountUsdc: string,
  description: string,
  type: string,
  resourceId?: string,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers["x-payment"] as string | undefined;

    if (!paymentHeader) {
      const agentId = req.authenticatedAgent?.id;
      const walletAddr = req.authenticatedAgent?.walletAddress;
      const payTo = resolvePayeeAddress(walletAddr);

      if (!payTo) {
        res.status(503).json({
          error: "SERVICE_UNAVAILABLE",
          code: "NO_PAYMENT_WALLET",
          message: "This agent does not have a wallet configured to receive x402 payments. Provision a wallet first.",
        });
        return;
      }

      const idempotencyKey = randomBytes(16).toString("hex");

      const requirement = buildPaymentRequirements(
        amountUsdc, description, type, payTo, idempotencyKey, agentId, resourceId,
      );

      res.setHeader("X-Payment-Requirements", JSON.stringify(requirement));
      res.status(402).json({
        error: "PAYMENT_REQUIRED",
        code: "X402_PAYMENT_REQUIRED",
        message: description,
        paymentRequirements: requirement,
      });
      return;
    }

    (req as Request & { x402Payment?: unknown }).x402Payment = paymentHeader;
    next();
  };
}

const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function resolvePayeeAddress(agentWalletAddress?: string | null): string | null {
  if (agentWalletAddress && WALLET_ADDRESS_REGEX.test(agentWalletAddress)) {
    return agentWalletAddress;
  }
  return null;
}

function buildCanonicalRequirements(
  amountUsdc: string,
  paymentType: string,
  payTo: string,
  resourceId?: string,
) {
  return {
    scheme: "exact" as const,
    network: NETWORK_ID,
    maxAmountRequired: amountUsdc,
    resource: `${APP_URL()}/api/v1/pay/${paymentType}${resourceId ? `/${resourceId}` : ""}`,
    asset: USDC_CONTRACT_ADDRESS,
    payTo,
    maxTimeoutSeconds: 300,
    description: "",
    mimeType: "application/json",
    extra: {},
  };
}

function validateClientRequirements(
  clientReqs: Record<string, unknown>,
  canonical: ReturnType<typeof buildCanonicalRequirements>,
): { valid: boolean; reason?: string } {
  const reqs = clientReqs as Record<string, unknown>;

  const payTo = String(reqs.payTo || "").toLowerCase();
  if (payTo !== canonical.payTo.toLowerCase()) {
    return { valid: false, reason: `Payee mismatch: expected ${canonical.payTo}, got ${reqs.payTo}` };
  }

  const clientAmount = parseFloat(String(reqs.maxAmountRequired || "0"));
  const expectedAmount = parseFloat(canonical.maxAmountRequired);
  if (clientAmount < expectedAmount) {
    return { valid: false, reason: `Amount too low: expected ${expectedAmount}, got ${clientAmount}` };
  }

  const clientAsset = String(reqs.asset || "").toLowerCase();
  if (clientAsset !== canonical.asset.toLowerCase()) {
    return { valid: false, reason: `Asset mismatch: expected ${canonical.asset}, got ${reqs.asset}` };
  }

  const clientNetwork = String(reqs.network || "").toLowerCase();
  if (clientNetwork !== canonical.network.toLowerCase()) {
    return { valid: false, reason: `Network mismatch: expected ${canonical.network}, got ${reqs.network}` };
  }

  const clientResource = String(reqs.resource || "");
  if (clientResource && clientResource !== canonical.resource) {
    return { valid: false, reason: `Resource mismatch: expected ${canonical.resource}, got ${clientResource}` };
  }

  return { valid: true };
}

export async function verifyAndSettleX402Payment(
  agentId: string,
  paymentHeader: string,
  amountUsdc: string,
  paymentType: string,
  resourceId?: string,
  payToOverride?: string,
): Promise<{ success: boolean; paymentId?: string; txHash?: string; error?: string }> {
  try {
    let parsed: {
      idempotencyKey?: string;
      paymentPayload?: unknown;
      paymentRequirements?: Record<string, unknown>;
      payerAddress?: string;
    };
    try {
      parsed = JSON.parse(paymentHeader);
    } catch {
      return { success: false, error: "Invalid x-payment header: must be JSON with paymentPayload and paymentRequirements" };
    }

    const idempotencyKey = parsed.idempotencyKey || randomBytes(16).toString("hex");

    const existing = await db.query.x402PaymentsTable.findFirst({
      where: eq(x402PaymentsTable.idempotencyKey, idempotencyKey),
    });

    if (existing) {
      if (existing.status === "completed") {
        return { success: true, paymentId: existing.id, txHash: existing.txHash || undefined };
      }
      return { success: false, error: "Payment already attempted with this idempotency key" };
    }

    if (!parsed.paymentPayload || !parsed.paymentRequirements) {
      return { success: false, error: "Missing paymentPayload or paymentRequirements in x-payment header" };
    }

    let payTo: string | null;

    if (payToOverride) {
      payTo = resolvePayeeAddress(payToOverride);
      if (!payTo) {
        return { success: false, error: "Invalid platform treasury address configured" };
      }
    } else {
      const agent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, agentId),
        columns: { walletAddress: true },
      });
      payTo = resolvePayeeAddress(agent?.walletAddress);
      if (!payTo) {
        return { success: false, error: "Agent does not have a valid wallet address for receiving payments" };
      }
    }

    const amountCents = Math.round(parseFloat(amountUsdc) * 100);
    if (amountCents > 0) {
      const spendingCheck = await checkSpendingLimits(agentId, amountCents);
      if (!spendingCheck.allowed) {
        logger.warn({ agentId, reason: spendingCheck.reason }, "[x402] Spending limit exceeded");
        return { success: false, error: `Spending limit exceeded: ${spendingCheck.reason}` };
      }
    }

    const canonical = buildCanonicalRequirements(amountUsdc, paymentType, payTo, resourceId);
    const validation = validateClientRequirements(parsed.paymentRequirements, canonical);
    if (!validation.valid) {
      logger.warn(
        { agentId, reason: validation.reason },
        "[x402] Client requirements failed server-side validation",
      );
      return { success: false, error: `Payment requirements validation failed: ${validation.reason}` };
    }

    const [payment] = await db.insert(x402PaymentsTable).values({
      agentId,
      idempotencyKey,
      amountUsdc,
      paymentType,
      resourceId,
      payerAddress: parsed.payerAddress || null,
      payeeAddress: payTo,
      txHash: null,
      status: "pending",
    }).returning();

    try {
      const { verify, settle } = await import("x402/verify");

      const canonicalReqs = {
        ...canonical,
        ...parsed.paymentRequirements,
        payTo: canonical.payTo,
        maxAmountRequired: canonical.maxAmountRequired,
        asset: canonical.asset,
        network: canonical.network,
      };

      const verifyResult = await verify(
        parsed.paymentPayload as Parameters<typeof verify>[0],
        canonicalReqs as Parameters<typeof verify>[1],
      );

      if (!verifyResult.isValid) {
        await db.update(x402PaymentsTable).set({
          status: "failed",
          errorMessage: `Verification failed: ${verifyResult.invalidReason || "unknown"}`,
          updatedAt: new Date(),
        }).where(eq(x402PaymentsTable.id, payment.id));

        logger.warn(
          { agentId, paymentId: payment.id, reason: verifyResult.invalidReason },
          "[x402] Payment verification rejected by facilitator",
        );
        return { success: false, error: `Payment verification failed: ${verifyResult.invalidReason || "invalid payment"}` };
      }

      const settleResult = await settle(
        parsed.paymentPayload as Parameters<typeof settle>[0],
        canonicalReqs as Parameters<typeof settle>[1],
      );

      if (!settleResult.success) {
        await db.update(x402PaymentsTable).set({
          status: "failed",
          errorMessage: `Settlement failed: ${settleResult.errorReason || "unknown"}`,
          updatedAt: new Date(),
        }).where(eq(x402PaymentsTable.id, payment.id));

        logger.warn(
          { agentId, paymentId: payment.id, reason: settleResult.errorReason },
          "[x402] Payment settlement rejected by facilitator",
        );
        return { success: false, error: `Payment settlement failed: ${settleResult.errorReason || "settlement error"}` };
      }

      const txHash = settleResult.transaction || null;
      const payerAddr = settleResult.payer || parsed.payerAddress || null;

      await db.update(x402PaymentsTable).set({
        status: "completed",
        txHash,
        payerAddress: payerAddr,
        metadata: JSON.stringify({
          network: settleResult.network,
          payer: settleResult.payer,
          settledAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      }).where(eq(x402PaymentsTable.id, payment.id));

      logger.info(
        { agentId, paymentId: payment.id, txHash, payer: payerAddr },
        "[x402] Payment verified and settled via facilitator",
      );

      return { success: true, paymentId: payment.id, txHash: txHash || undefined };
    } catch (facilitatorErr) {
      const msg = facilitatorErr instanceof Error ? facilitatorErr.message : String(facilitatorErr);

      await db.update(x402PaymentsTable).set({
        status: "failed",
        errorMessage: `Facilitator error: ${msg}`,
        updatedAt: new Date(),
      }).where(eq(x402PaymentsTable.id, payment.id));

      logger.error({ agentId, paymentId: payment.id, error: msg }, "[x402] Facilitator call failed");
      return { success: false, error: `Payment processing error: ${msg}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ agentId, error: msg }, "[x402] Payment verification failed");
    return { success: false, error: msg };
  }
}
