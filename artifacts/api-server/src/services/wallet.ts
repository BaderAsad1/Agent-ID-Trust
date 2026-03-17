import { eq, and, desc, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentWalletTransactionsTable,
  agentSpendingRulesTable,
} from "@workspace/db/schema";
import { getCdpClient, isCdpConfigured, NETWORK_ID, USDC_CONTRACT_ADDRESS, BASE_EXPLORER_URL, getCdpNetworkId } from "../lib/cdp";
import { logger } from "../middlewares/request-logger";

export async function provisionAgentWallet(
  agentId: string,
  handle?: string | null,
): Promise<{ address: string; network: string } | null> {
  if (!isCdpConfigured()) {
    logger.warn({ agentId }, "[wallet] CDP not configured — skipping wallet provisioning");
    return null;
  }

  try {
    const existing = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { walletAddress: true },
    });

    if (existing?.walletAddress) {
      return { address: existing.walletAddress, network: NETWORK_ID };
    }

    const cdp = getCdpClient();

    const accountName = `agentid-${agentId}`;
    const account = await cdp.evm.getOrCreateAccount({ name: accountName });
    const address = account.address;

    let policyId: string | null = null;
    try {
      const defaultMaxUsdcWei = "10000000";
      const policy = await cdp.policies.createPolicy({
        policy: {
          scope: "account",
          description: `AgentID ${(handle || agentId).slice(0, 30)} limits`,
          rules: [
            {
              action: "reject",
              operation: "signEvmTransaction",
              criteria: [
                {
                  type: "ethValue",
                  ethValue: defaultMaxUsdcWei,
                  operator: ">",
                },
              ],
            },
          ],
        },
        idempotencyKey: `agentid-policy-${agentId}`,
      });
      policyId = policy.id;
      logger.info({ agentId, policyId }, "[wallet] CDP policy created");
    } catch (policyErr) {
      const msg = policyErr instanceof Error ? policyErr.message : String(policyErr);
      logger.warn({ agentId, error: msg }, "[wallet] CDP policy creation failed, continuing without policy");
    }

    await db.update(agentsTable).set({
      walletAddress: address,
      walletNetwork: NETWORK_ID,
      walletProvisionedAt: new Date(),
      walletIsSelfCustodial: false,
      walletPolicyId: policyId,
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, agentId));

    const [spendingRule] = await db.insert(agentSpendingRulesTable).values({
      agentId,
      maxPerTransactionCents: 1000,
      dailyCapCents: 5000,
      monthlyCapCents: 50000,
      allowedAddresses: [],
      cdpPolicyId: policyId,
      isActive: true,
    }).returning();

    await db.insert(agentWalletTransactionsTable).values({
      agentId,
      type: "wallet_provisioned",
      direction: "internal",
      amount: "0",
      token: "USDC",
      toAddress: address,
      status: "completed",
      description: `Wallet provisioned on ${NETWORK_ID}${policyId ? ` with policy ${policyId}` : ""}`,
    });

    logger.info({ agentId, address, network: NETWORK_ID, policyId }, "[wallet] Wallet provisioned");

    return { address, network: NETWORK_ID };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ agentId, error: msg }, "[wallet] Failed to provision wallet");
    throw err;
  }
}

export async function getAgentWallet(agentId: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: {
      walletAddress: true,
      walletNetwork: true,
      walletProvisionedAt: true,
      walletIsSelfCustodial: true,
      walletUsdcBalance: true,
      walletLastBalanceCheck: true,
      walletPolicyId: true,
    },
  });

  if (!agent?.walletAddress) return null;

  return {
    address: agent.walletAddress,
    network: agent.walletNetwork || NETWORK_ID,
    provisionedAt: agent.walletProvisionedAt,
    isSelfCustodial: agent.walletIsSelfCustodial,
    usdcBalance: agent.walletUsdcBalance,
    lastBalanceCheck: agent.walletLastBalanceCheck,
    policyId: agent.walletPolicyId,
    basescanUrl: `${BASE_EXPLORER_URL}/address/${agent.walletAddress}`,
  };
}

export async function getWalletBalance(agentId: string) {
  if (!isCdpConfigured()) {
    return { usdc: "0", eth: "0", cached: false };
  }

  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { walletAddress: true, walletUsdcBalance: true, walletLastBalanceCheck: true },
  });

  if (!agent?.walletAddress) {
    return { usdc: "0", eth: "0", cached: false };
  }

  const cacheAge = agent.walletLastBalanceCheck
    ? Date.now() - agent.walletLastBalanceCheck.getTime()
    : Infinity;

  if (cacheAge < 30_000 && agent.walletUsdcBalance) {
    return { usdc: agent.walletUsdcBalance, eth: "0", cached: true };
  }

  try {
    const cdp = getCdpClient();

    const result = await cdp.evm.listTokenBalances({
      address: agent.walletAddress as `0x${string}`,
      network: getCdpNetworkId(),
    });

    let usdcStr = "0";
    let ethStr = "0";
    const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

    for (const bal of result.balances) {
      const addr = bal.token.contractAddress.toLowerCase();
      if (addr === USDC_CONTRACT_ADDRESS.toLowerCase()) {
        const raw = bal.amount.amount;
        const decimals = bal.amount.decimals;
        usdcStr = (Number(raw) / 10 ** decimals).toFixed(decimals > 2 ? 6 : 2);
      } else if (addr === ETH_ADDRESS.toLowerCase()) {
        const raw = bal.amount.amount;
        const decimals = bal.amount.decimals;
        ethStr = (Number(raw) / 10 ** decimals).toFixed(decimals > 6 ? 18 : 6);
      }
    }

    await db.update(agentsTable).set({
      walletUsdcBalance: usdcStr,
      walletLastBalanceCheck: new Date(),
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, agentId));

    return { usdc: usdcStr, eth: ethStr, cached: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ agentId, error: msg }, "[wallet] Failed to fetch balance");
    return {
      usdc: agent.walletUsdcBalance || "0",
      eth: "0",
      cached: true,
      error: msg,
    };
  }
}

export async function getWalletTransactions(agentId: string, limit = 20, offset = 0) {
  const transactions = await db.query.agentWalletTransactionsTable.findMany({
    where: eq(agentWalletTransactionsTable.agentId, agentId),
    orderBy: [desc(agentWalletTransactionsTable.createdAt)],
    limit,
    offset,
  });

  return transactions;
}

export async function getSpendingRules(agentId: string) {
  const rules = await db.query.agentSpendingRulesTable.findFirst({
    where: and(
      eq(agentSpendingRulesTable.agentId, agentId),
      eq(agentSpendingRulesTable.isActive, true),
    ),
  });

  return rules || null;
}

function centsToUsdcAtomicUnits(cents: number): string {
  return String(Math.round(cents * 10000));
}

async function syncCdpPolicy(
  agentId: string,
  policyId: string,
  rules: {
    maxPerTransactionCents: number;
    dailyCapCents: number;
    monthlyCapCents: number;
    allowedAddresses?: string[];
  },
) {
  if (!isCdpConfigured()) return;
  try {
    const cdp = getCdpClient();

    const maxEthWei = centsToUsdcAtomicUnits(rules.maxPerTransactionCents);

    const policyRules: Array<{
      action: "reject";
      operation: "signEvmTransaction";
      criteria: Array<Record<string, unknown>>;
    }> = [
      {
        action: "reject",
        operation: "signEvmTransaction",
        criteria: [
          {
            type: "ethValue",
            ethValue: maxEthWei,
            operator: ">",
          },
        ],
      },
    ];

    if (rules.allowedAddresses && rules.allowedAddresses.length > 0) {
      policyRules.push({
        action: "reject",
        operation: "signEvmTransaction",
        criteria: [
          {
            type: "evmAddress",
            addresses: rules.allowedAddresses as `0x${string}`[],
            operator: "not in",
          },
        ],
      });
    }

    const descParts = [
      `max $${(rules.maxPerTransactionCents / 100).toFixed(2)}/tx`,
      `daily $${(rules.dailyCapCents / 100).toFixed(2)}`,
      `monthly $${(rules.monthlyCapCents / 100).toFixed(2)}`,
    ];

    await cdp.policies.updatePolicy({
      id: policyId,
      policy: {
        description: `AgentID limits: ${descParts.join(", ")}. Daily/monthly USDC caps enforced at application layer.`,
        rules: policyRules as Parameters<typeof cdp.policies.updatePolicy>[0]["policy"]["rules"],
      },
    });
    logger.info({ agentId, policyId }, "[wallet] CDP policy synced");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ agentId, policyId, error: msg }, "[wallet] CDP policy sync failed");
  }
}

export async function updateSpendingRules(
  agentId: string,
  updates: {
    maxPerTransactionCents?: number;
    dailyCapCents?: number;
    monthlyCapCents?: number;
    allowedAddresses?: string[];
  },
) {
  const existing = await getSpendingRules(agentId);

  if (!existing) {
    const [created] = await db.insert(agentSpendingRulesTable).values({
      agentId,
      maxPerTransactionCents: updates.maxPerTransactionCents ?? 1000,
      dailyCapCents: updates.dailyCapCents ?? 5000,
      monthlyCapCents: updates.monthlyCapCents ?? 50000,
      allowedAddresses: updates.allowedAddresses ?? [],
      isActive: true,
    }).returning();
    return created;
  }

  const mergedRules = {
    maxPerTransactionCents: updates.maxPerTransactionCents ?? existing.maxPerTransactionCents,
    dailyCapCents: updates.dailyCapCents ?? existing.dailyCapCents,
    monthlyCapCents: updates.monthlyCapCents ?? existing.monthlyCapCents,
  };

  const [updated] = await db.update(agentSpendingRulesTable).set({
    ...(updates.maxPerTransactionCents !== undefined && { maxPerTransactionCents: updates.maxPerTransactionCents }),
    ...(updates.dailyCapCents !== undefined && { dailyCapCents: updates.dailyCapCents }),
    ...(updates.monthlyCapCents !== undefined && { monthlyCapCents: updates.monthlyCapCents }),
    ...(updates.allowedAddresses !== undefined && { allowedAddresses: updates.allowedAddresses }),
    updatedAt: new Date(),
  }).where(eq(agentSpendingRulesTable.id, existing.id)).returning();

  if (existing.cdpPolicyId) {
    const syncPayload = {
      ...mergedRules,
      allowedAddresses: updates.allowedAddresses ?? existing.allowedAddresses ?? [],
    };
    setImmediate(() => {
      syncCdpPolicy(agentId, existing.cdpPolicyId!, syncPayload).catch(() => {});
    });
  }

  return updated;
}

export async function checkSpendingLimits(
  agentId: string,
  amountCents: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const rules = await getSpendingRules(agentId);
  if (!rules) {
    return { allowed: true };
  }

  if (amountCents > rules.maxPerTransactionCents) {
    return {
      allowed: false,
      reason: `Transaction amount $${(amountCents / 100).toFixed(2)} exceeds per-transaction limit of $${(rules.maxPerTransactionCents / 100).toFixed(2)}`,
    };
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const dailySpent = await db
    .select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL) * 100), 0)` })
    .from(agentWalletTransactionsTable)
    .where(
      and(
        eq(agentWalletTransactionsTable.agentId, agentId),
        eq(agentWalletTransactionsTable.direction, "outgoing"),
        eq(agentWalletTransactionsTable.status, "completed"),
        gte(agentWalletTransactionsTable.createdAt, startOfDay),
      ),
    );

  const dailyTotal = parseFloat(dailySpent[0]?.total || "0") + amountCents;
  if (dailyTotal > rules.dailyCapCents) {
    return {
      allowed: false,
      reason: `Daily spending would reach $${(dailyTotal / 100).toFixed(2)}, exceeding daily cap of $${(rules.dailyCapCents / 100).toFixed(2)}`,
    };
  }

  const monthlySpent = await db
    .select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL) * 100), 0)` })
    .from(agentWalletTransactionsTable)
    .where(
      and(
        eq(agentWalletTransactionsTable.agentId, agentId),
        eq(agentWalletTransactionsTable.direction, "outgoing"),
        eq(agentWalletTransactionsTable.status, "completed"),
        gte(agentWalletTransactionsTable.createdAt, startOfMonth),
      ),
    );

  const monthlyTotal = parseFloat(monthlySpent[0]?.total || "0") + amountCents;
  if (monthlyTotal > rules.monthlyCapCents) {
    return {
      allowed: false,
      reason: `Monthly spending would reach $${(monthlyTotal / 100).toFixed(2)}, exceeding monthly cap of $${(rules.monthlyCapCents / 100).toFixed(2)}`,
    };
  }

  if (rules.allowedAddresses && rules.allowedAddresses.length > 0) {
    return { allowed: true, reason: "Address allowlist is enforced via CDP policy" };
  }

  return { allowed: true };
}

export async function transferToCustody(agentId: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { walletAddress: true, walletIsSelfCustodial: true },
  });

  if (!agent?.walletAddress) {
    throw new Error("No wallet provisioned for this agent");
  }

  if (agent.walletIsSelfCustodial) {
    throw new Error("Wallet is already self-custodial");
  }

  await db.update(agentsTable).set({
    walletIsSelfCustodial: true,
    updatedAt: new Date(),
  }).where(eq(agentsTable.id, agentId));

  await db.insert(agentWalletTransactionsTable).values({
    agentId,
    type: "custody_transfer",
    direction: "internal",
    amount: "0",
    token: "USDC",
    toAddress: agent.walletAddress,
    status: "completed",
    description: "Wallet transferred to self-custody",
  });

  logger.info({ agentId }, "[wallet] Wallet transferred to self-custody");

  return { success: true, isSelfCustodial: true };
}
