import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const OPENCLAW_AGENT_ID = "9ee8cc2f-eded-4235-af99-8bcd5e6830da";

async function clearOpenClawWallet() {
  console.log(`Clearing wallet fields for agent ${OPENCLAW_AGENT_ID} (OpenClaw)...`);

  const before = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, OPENCLAW_AGENT_ID),
    columns: {
      id: true,
      handle: true,
      walletAddress: true,
      walletNetwork: true,
      walletProvisionedAt: true,
      walletIsSelfCustodial: true,
    },
  });

  if (!before) {
    console.log("Agent not found — nothing to clear.");
    process.exit(0);
  }

  console.log("Before:", JSON.stringify(before, null, 2));

  const result = await db
    .update(agentsTable)
    .set({
      walletAddress: null,
      walletNetwork: null,
      walletProvisionedAt: null,
      walletIsSelfCustodial: null,
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, OPENCLAW_AGENT_ID))
    .returning({
      id: agentsTable.id,
      walletAddress: agentsTable.walletAddress,
      walletNetwork: agentsTable.walletNetwork,
    });

  console.log("After:", JSON.stringify(result, null, 2));
  console.log("Done. OpenClaw wallet fields cleared. A real wallet can now be provisioned via POST /api/v1/agents/:agentId/wallet/provision");
}

clearOpenClawWallet().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
