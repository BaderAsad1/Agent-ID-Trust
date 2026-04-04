import { eq, and, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentKeysTable,
  agentTransfersTable,
} from "@workspace/db/schema";

export interface AssetClassification {
  name: string;
  category: "transferable" | "buyer_must_reconnect" | "excluded_by_default";
  description: string;
}

export interface TransferBlocker {
  code: string;
  message: string;
}

export interface TransferReadinessReport {
  agentId: string;
  handle: string | null;
  isReady: boolean;
  blockers: TransferBlocker[];
  assets: {
    transferable: AssetClassification[];
    buyer_must_reconnect: AssetClassification[];
    excluded_by_default: AssetClassification[];
  };
  summary: {
    totalAssets: number;
    transferableCount: number;
    reconnectRequiredCount: number;
    excludedCount: number;
  };
  generatedAt: string;
}

const TRANSFERABLE_ASSETS: AssetClassification[] = [
  { name: "handle", category: "transferable", description: "Agent handle / identity" },
  { name: "profile", category: "transferable", description: "Public profile data (display name, avatar, description)" },
  { name: "public_history_archive", category: "transferable", description: "Publicly visible task and activity history" },
  { name: "workflows_config", category: "transferable", description: "Workflow and prompt configurations" },
  { name: "routing_rules", category: "transferable", description: "Routing rules and capability declarations" },
  { name: "marketplace_listing_config", category: "transferable", description: "Marketplace listing configuration" },
  { name: "documentation", category: "transferable", description: "Agent documentation and README" },
];

const BUYER_MUST_RECONNECT_ASSETS: AssetClassification[] = [
  { name: "llm_api_key_references", category: "buyer_must_reconnect", description: "LLM API key references (keys themselves are not transferred)" },
  { name: "mcp_tool_credential_references", category: "buyer_must_reconnect", description: "MCP/tool credential references" },
  { name: "webhook_secrets", category: "buyer_must_reconnect", description: "Webhook endpoint secrets" },
  { name: "database_credential_references", category: "buyer_must_reconnect", description: "Database credential references" },
  { name: "external_saas_integration_references", category: "buyer_must_reconnect", description: "External SaaS integration references" },
  { name: "endpoint_config", category: "buyer_must_reconnect", description: "Endpoint URL and connection configuration" },
];

const EXCLUDED_ASSETS: AssetClassification[] = [
  { name: "seller_billing_credentials", category: "excluded_by_default", description: "Seller's billing and payment credentials" },
  { name: "raw_api_secrets", category: "excluded_by_default", description: "Raw API secrets and private keys" },
  { name: "non_transferable_licenses", category: "excluded_by_default", description: "Non-transferable software licenses" },
];

export async function generateReadinessReport(agentId: string): Promise<TransferReadinessReport> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const blockers: TransferBlocker[] = [];

  if (agent.verificationStatus !== "verified") {
    blockers.push({
      code: "NOT_VERIFIED",
      message: "Agent must be verified before transfer",
    });
  }

  if (agent.status === "suspended") {
    blockers.push({
      code: "SUSPENDED",
      message: "Suspended agents cannot be transferred",
    });
  }

  const activeTransfers = await db.query.agentTransfersTable.findMany({
    where: and(
      eq(agentTransfersTable.agentId, agentId),
      ne(agentTransfersTable.status, "completed"),
      ne(agentTransfersTable.status, "cancelled"),
    ),
  });

  if (activeTransfers.length > 0) {
    blockers.push({
      code: "ACTIVE_TRANSFER",
      message: "Agent already has an active transfer in progress",
    });
  }

  const disputedTransfers = await db.query.agentTransfersTable.findMany({
    where: and(
      eq(agentTransfersTable.agentId, agentId),
      eq(agentTransfersTable.status, "disputed"),
    ),
  });

  if (disputedTransfers.length > 0) {
    blockers.push({
      code: "UNRESOLVED_DISPUTE",
      message: "Agent has unresolved transfer disputes that must be settled first",
    });
  }

  const agentRecord = agent as Record<string, unknown>;
  const billingStatus = agentRecord.billingStatus || agentRecord.billing_status;
  if (billingStatus === "past_due" || billingStatus === "delinquent" || billingStatus === "suspended") {
    blockers.push({
      code: "UNRESOLVED_BILLING",
      message: "Agent has unresolved billing issues that must be settled before transfer",
    });
  }

  const allAssets = [
    ...TRANSFERABLE_ASSETS,
    ...BUYER_MUST_RECONNECT_ASSETS,
    ...EXCLUDED_ASSETS,
  ];

  return {
    agentId,
    handle: agent.handle ?? null,
    isReady: blockers.length === 0,
    blockers,
    assets: {
      transferable: TRANSFERABLE_ASSETS,
      buyer_must_reconnect: BUYER_MUST_RECONNECT_ASSETS,
      excluded_by_default: EXCLUDED_ASSETS,
    },
    summary: {
      totalAssets: allAssets.length,
      transferableCount: TRANSFERABLE_ASSETS.length,
      reconnectRequiredCount: BUYER_MUST_RECONNECT_ASSETS.length,
      excludedCount: EXCLUDED_ASSETS.length,
    },
    generatedAt: new Date().toISOString(),
  };
}
