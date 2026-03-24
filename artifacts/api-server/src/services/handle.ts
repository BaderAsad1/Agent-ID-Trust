import { eq, and, isNull, sql, gte, count, lt } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable, handleAuctionsTable, handlePaymentsTable, usersTable, handleRegistrationLogTable } from "@workspace/db/schema";
import { logger } from "../middlewares/request-logger";

export type HandleTier = "reserved_1_2" | "premium_3" | "premium_4" | "standard_5plus";

export interface HandleTierInfo {
  tier: HandleTier;
  annualCents: number;
  annualUsd: number;
  label: string;
  requiresPayment: boolean;
  freeWithPlan: boolean;
}

export const HANDLE_TIERS: Record<HandleTier, HandleTierInfo> = {
  reserved_1_2: {
    tier: "reserved_1_2",
    annualCents: 0,
    annualUsd: 0,
    label: "Reserved (1-2 chars)",
    requiresPayment: false,
    freeWithPlan: false,
  },
  premium_3: {
    tier: "premium_3",
    annualCents: 64000,
    annualUsd: 640,
    label: "3-character premium",
    requiresPayment: true,
    freeWithPlan: false,
  },
  premium_4: {
    tier: "premium_4",
    annualCents: 16000,
    annualUsd: 160,
    label: "4-character premium",
    requiresPayment: true,
    freeWithPlan: false,
  },
  standard_5plus: {
    tier: "standard_5plus",
    annualCents: 500,
    annualUsd: 5,
    label: "5+ character standard",
    requiresPayment: false,
    freeWithPlan: true,
  },
};

export const RESERVED_HANDLES = new Set([
  "admin", "administrator", "root", "system", "support", "help", "info", "contact",
  "team", "staff", "bot", "api", "dev", "test", "null", "undefined",
  "billing", "security", "privacy", "legal", "abuse", "noreply",
  "no-reply", "postmaster", "webmaster", "hostmaster", "register",
  "registration", "signup", "signin", "login", "logout", "auth",
  "oauth", "callback", "webhook", "health", "status", "ping",
  "agentid", "getagent", "getai", "ens", "ethereum", "bitcoin",
  "openai", "anthropic", "google", "deepmind", "mistral", "microsoft", "apple", "amazon",
  "aws", "nvidia", "meta", "x", "twitter", "facebook", "instagram", "linkedin",
  "github", "gitlab", "stripe", "paypal",
  "cohere", "stability", "stabilityai", "huggingface", "ollama", "groq",
  "perplexity", "inflection", "adept", "writer", "together", "replicate",
  "anyscale", "databricks", "salesforce",
  "gpt", "gpt4", "gpt3", "claude", "gemini", "llama", "llama2", "llama3",
  "falcon", "mixtral", "bard", "copilot", "chatgpt", "grok", "xai",
  "langchain", "llamaindex", "autogpt", "babyagi", "crewai",
  "agentops", "agentprotocol", "a2a", "mcp", "openrouter",
  "official", "platform", "moderator", "trust",
]);

export function getHandleTier(handle: string): HandleTierInfo {
  const normalized = handle.toLowerCase().replace(/[^a-z0-9]/g, "");
  const len = normalized.length;

  if (len <= 2) return HANDLE_TIERS.reserved_1_2;
  if (len === 3) return HANDLE_TIERS.premium_3;
  if (len === 4) return HANDLE_TIERS.premium_4;
  return HANDLE_TIERS.standard_5plus;
}

export function isHandleReserved(handle: string): boolean {
  const normalized = handle.toLowerCase().replace(/[^a-z0-9]/g, "");
  return RESERVED_HANDLES.has(normalized) || normalized.length <= 2;
}

export function isHandleValid(handle: string): { valid: boolean; reason?: string } {
  const normalized = handle.toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(normalized) && !/^[a-z0-9]$/.test(normalized)) {
    return { valid: false, reason: "Handle must start and end with alphanumeric characters and contain only letters, numbers, or hyphens" };
  }

  if (normalized.includes("--")) {
    return { valid: false, reason: "Handle cannot contain consecutive hyphens" };
  }

  const alphanumLen = normalized.replace(/[^a-z0-9]/g, "").length;
  if (alphanumLen < 1) {
    return { valid: false, reason: "Handle must contain at least one alphanumeric character" };
  }

  if (alphanumLen <= 2) {
    return { valid: false, reason: "Handles of 1-2 characters are reserved" };
  }

  if (normalized.length > 100) {
    return { valid: false, reason: "Handle must be 100 characters or fewer" };
  }

  return { valid: true };
}

export async function checkHandleAvailability(handle: string): Promise<{
  available: boolean;
  handle: string;
  tier: HandleTier;
  annual: number;
  annualUsd: number;
  reserved?: boolean;
  reason?: string;
}> {
  const normalized = handle.toLowerCase();
  const tierInfo = getHandleTier(normalized);

  const validation = isHandleValid(normalized);
  if (!validation.valid) {
    return {
      available: false,
      handle: normalized,
      tier: tierInfo.tier,
      annual: tierInfo.annualCents,
      annualUsd: tierInfo.annualUsd,
      reserved: true,
      reason: validation.reason,
    };
  }

  if (isHandleReserved(normalized)) {
    return {
      available: false,
      handle: normalized,
      tier: tierInfo.tier,
      annual: tierInfo.annualCents,
      annualUsd: tierInfo.annualUsd,
      reserved: true,
      reason: "This handle is reserved",
    };
  }

  const existing = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.handle, normalized),
    columns: { id: true, handle: true },
  });

  return {
    available: !existing,
    handle: normalized,
    tier: tierInfo.tier,
    annual: tierInfo.annualCents,
    annualUsd: tierInfo.annualUsd,
  };
}

export async function assignHandleToAgent(
  agentId: string,
  handle: string,
  options: {
    tier: HandleTier;
    paid?: boolean;
    stripeSubscriptionId?: string;
    isOnchain?: boolean;
    expiresAt?: Date;
  },
): Promise<void> {
  const { validateHandle } = await import("./agents");
  const normalizedHandle = handle.toLowerCase();
  const validationError = validateHandle(normalizedHandle);
  if (validationError) {
    throw new Error(`INVALID_HANDLE: ${validationError}`);
  }

  const tierInfo = HANDLE_TIERS[options.tier];
  const expiresAt = options.expiresAt ?? (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  })();

  await db.update(agentsTable).set({
    handle: handle.toLowerCase(),
    handleTier: options.tier,
    handlePaid: options.paid ?? false,
    handleIsOnchain: options.isOnchain ?? false,
    handleStripeSubscriptionId: options.stripeSubscriptionId ?? null,
    handleExpiresAt: expiresAt,
    handleRegisteredAt: new Date(),
    annualPriceUsd: tierInfo.annualUsd,
    updatedAt: new Date(),
  }).where(eq(agentsTable.id, agentId));

  try {
    const { deleteResolutionCache } = await import("../lib/resolution-cache");
    await deleteResolutionCache(handle.toLowerCase());
  } catch {}

  logger.info({ agentId, handle, tier: options.tier }, "[handle] Handle assigned to agent");
}

export async function getGracePeriodDays(handleTier: string | null): Promise<number> {
  const tier = handleTier as HandleTier | null;
  if (tier === "premium_3" || tier === "premium_4") return 90;
  return 30;
}

export async function startHandleGracePeriod(agentId: string): Promise<void> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { id: true, handle: true, handleTier: true, handleExpiresAt: true, status: true },
  });

  if (!agent || !agent.handle) return;

  const graceDays = await getGracePeriodDays(agent.handleTier);
  const gracePeriodEnd = new Date();
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + graceDays);

  await db.update(agentsTable).set({
    metadata: sql`jsonb_set(COALESCE(metadata, '{}'), '{handleGracePeriod}', ${JSON.stringify({
      startedAt: new Date().toISOString(),
      endsAt: gracePeriodEnd.toISOString(),
      graceDays,
      tier: agent.handleTier,
    })}::jsonb)`,
    updatedAt: new Date(),
  }).where(eq(agentsTable.id, agentId));

  logger.info({ agentId, handle: agent.handle, graceDays, gracePeriodEnd }, "[handle] Handle grace period started");
}

export async function processHandleExpiry(agentId: string): Promise<void> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { id: true, handle: true, handleTier: true, handleExpiresAt: true, metadata: true, status: true },
  });

  if (!agent || !agent.handleExpiresAt) return;

  await startHandleGracePeriod(agentId);
}

export async function processSuspendedHandles(): Promise<void> {
  const now = new Date();

  const allAgentsWithHandles = await db.select({
    id: agentsTable.id,
    handle: agentsTable.handle,
    handleTier: agentsTable.handleTier,
    handleExpiresAt: agentsTable.handleExpiresAt,
    metadata: agentsTable.metadata,
    status: agentsTable.status,
  }).from(agentsTable).where(
    sql`handle IS NOT NULL AND status NOT IN ('revoked', 'suspended') AND metadata->'handleGracePeriod' IS NOT NULL`,
  );

  for (const agent of allAgentsWithHandles) {
    try {
      const meta = (agent.metadata as Record<string, unknown>) ?? {};
      const gracePeriod = meta.handleGracePeriod as { endsAt?: string } | undefined;
      if (!gracePeriod?.endsAt) continue;

      const gracePeriodEnd = new Date(gracePeriod.endsAt);
      if (now >= gracePeriodEnd) {
        await db.update(agentsTable).set({
          status: "suspended",
          updatedAt: new Date(),
        }).where(eq(agentsTable.id, agent.id));

        try {
          const { deleteResolutionCache } = await import("../lib/resolution-cache");
          await deleteResolutionCache(agent.handle!.toLowerCase());
        } catch {}

        logger.info({ agentId: agent.id, handle: agent.handle }, "[handle] Handle suspended after grace period");
      }
    } catch (err) {
      logger.error({ agentId: agent.id, error: err instanceof Error ? err.message : String(err) }, "[handle] Error processing handle suspension");
    }
  }
}

export async function releaseHandleToAuction(agentId: string): Promise<void> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { id: true, handle: true, handleTier: true, annualPriceUsd: true },
  });

  if (!agent || !agent.handle) return;

  const tierInfo = agent.handleTier ? HANDLE_TIERS[agent.handleTier as HandleTier] : null;
  const startPrice = tierInfo ? calculateAuctionPrice(agent.handle, 21) : 1000;

  const auctionEnd = new Date();
  auctionEnd.setDate(auctionEnd.getDate() + 21);

  await db.insert(handleAuctionsTable).values({
    handle: agent.handle,
    startPrice,
    reservePrice: startPrice,
    currentPrice: startPrice,
    endsAt: auctionEnd,
  });

  await db.update(agentsTable).set({
    handle: sql`NULL`,
    handleTier: null,
    handleExpiresAt: null,
    handleRegisteredAt: null,
    handlePaid: false,
    handleStripeSubscriptionId: null,
    updatedAt: new Date(),
  }).where(eq(agentsTable.id, agentId));

  try {
    const { deleteResolutionCache } = await import("../lib/resolution-cache");
    await deleteResolutionCache(agent.handle!.toLowerCase());
  } catch {}

  logger.info({ agentId, handle: agent.handle }, "[handle] Handle released to auction");
}

export function calculateAuctionPrice(handle: string, daysLeft: number): number {
  const tierInfo = getHandleTier(handle);
  const basePriceCents = tierInfo.annualCents;

  const depreciationFactor = Math.max(0.1, daysLeft / 21);
  return Math.round(basePriceCents * depreciationFactor);
}

export async function checkRateLimit(
  userId: string,
): Promise<{ allowed: boolean; status: number; message: string } | null> {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = await db
    .select({ count: count() })
    .from(handleRegistrationLogTable)
    .where(
      and(
        eq(handleRegistrationLogTable.userId, userId),
        gte(handleRegistrationLogTable.createdAt, windowStart),
      ),
    );
  const recent = recentCount[0]?.count ?? 0;
  if (recent >= 5) {
    return {
      allowed: false,
      status: 429,
      message: "Maximum 5 handle registrations per 24-hour window. Please try again later.",
    };
  }
  return null;
}

export async function checkHandleRegistrationLimits(
  userId: string,
  handle: string,
): Promise<{ allowed: boolean; status: number; message: string } | null> {
  const normalized = handle.toLowerCase();
  const tier = getHandleTier(normalized);

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, createdAt: true },
  });

  if (!user) return { allowed: false, status: 404, message: "User not found" };

  const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  if (tier.tier === "premium_3" && accountAgeMs < sevenDaysMs) {
    return {
      allowed: false,
      status: 403,
      message: "Account must be at least 7 days old to register premium handles",
    };
  }

  if (tier.tier === "premium_3" || tier.tier === "premium_4") {
    const tierLimit = tier.tier === "premium_3" ? 1 : 2;
    const handleLen = tier.tier === "premium_3" ? 3 : 4;
    const existingHandles = await db
      .select({ handle: agentsTable.handle })
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.userId, userId),
          isNull(agentsTable.revokedAt),
          sql`${agentsTable.handle} IS NOT NULL`,
        ),
      );
    const activeCount = existingHandles.filter((a) => {
      if (!a.handle) return false;
      const len = a.handle.replace(/[^a-z0-9]/g, "").length;
      return len === handleLen;
    }).length;
    if (activeCount >= tierLimit) {
      return {
        allowed: false,
        status: 409,
        message: `Maximum ${tierLimit} handles of this tier per account`,
      };
    }
  }

  return null;
}

export async function recordHandleRegistration(userId: string, handle: string): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(handleRegistrationLogTable).where(
    lt(handleRegistrationLogTable.createdAt, cutoff),
  );
  await db.insert(handleRegistrationLogTable).values({
    userId,
    handle,
  });
  logger.info({ userId, handle }, "[handle] Registration logged");
}
