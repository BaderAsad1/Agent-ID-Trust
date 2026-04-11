/**
 * Agent OAuth Token (Connected Apps) Routes
 *
 * GET    /v1/agents/:agentId/oauth-tokens            — List active authorized connections for an agent
 * DELETE /v1/agents/:agentId/oauth-tokens/:tokenId   — Revoke a specific authorized connection
 */
import { Router } from "express";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { oauthTokensTable, oauthClientsTable, agentsTable } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { isAgentOwner } from "../../services/agents";

const router = Router();

router.use(requireAuth);

async function getOwnedAgent(agentId: string, userId: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });
  if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");
  if (!isAgentOwner(agent, userId)) throw new AppError(403, "FORBIDDEN", "You do not own this agent");
  return agent;
}

// GET /agents/:agentId/oauth-tokens
router.get("/:agentId/oauth-tokens", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    await getOwnedAgent(req.params.agentId, userId);

    const now = new Date();
    const tokens = await db.query.oauthTokensTable.findMany({
      where: and(
        eq(oauthTokensTable.agentId, req.params.agentId),
        isNull(oauthTokensTable.revokedAt),
        gt(oauthTokensTable.refreshExpiresAt, now),
      ),
    });

    // Enrich with client info
    const clientIds = [...new Set(tokens.map(t => t.clientId).filter(Boolean))] as string[];
    const clients = clientIds.length > 0
      ? await db.query.oauthClientsTable.findMany({
          where: (table, { inArray }) => inArray(table.clientId, clientIds),
        })
      : [];

    const clientMap = new Map(clients.map(c => [c.clientId, c]));

    const connections = tokens.map(t => {
      const client = t.clientId ? clientMap.get(t.clientId) : undefined;
      return {
        id: t.id,
        tokenId: t.tokenId,
        clientId: t.clientId,
        clientName: client?.name ?? t.clientId ?? "Unknown App",
        clientDescription: client?.description ?? null,
        scopes: t.scopes,
        grantType: t.grantType,
        trustTier: t.trustTier,
        issuedAt: t.issuedAt,
        expiresAt: t.expiresAt,
        refreshExpiresAt: t.refreshExpiresAt,
      };
    });

    res.json({ connections });
  } catch (err) {
    next(err);
  }
});

// DELETE /agents/:agentId/oauth-tokens/:tokenId
router.delete("/:agentId/oauth-tokens/:tokenId", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    await getOwnedAgent(req.params.agentId, userId);

    const token = await db.query.oauthTokensTable.findFirst({
      where: and(
        eq(oauthTokensTable.id, req.params.tokenId),
        eq(oauthTokensTable.agentId, req.params.agentId),
        isNull(oauthTokensTable.revokedAt),
      ),
    });

    if (!token) throw new AppError(404, "NOT_FOUND", "Token not found or already revoked");

    await db.update(oauthTokensTable)
      .set({ revokedAt: new Date(), revokedReason: "user_revocation" })
      .where(eq(oauthTokensTable.id, token.id));

    res.json({ success: true, tokenId: token.tokenId, revokedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
