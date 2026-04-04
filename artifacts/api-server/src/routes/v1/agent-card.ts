import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { publicRateLimit } from "../../middlewares/rate-limit";
import { handleErc8004 } from "./public-profiles";
import { env } from "../../lib/env";

const router = Router();

router.get("/:handle", publicRateLimit, (req, res) => {
  const handle = encodeURIComponent((req.params.handle as string).toLowerCase().trim());
  res.redirect(308, `${env().APP_URL}/api/v1/nft/metadata/${handle}`);
});

export async function handleDomainVerification(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  try {
    const appUrl = env().APP_URL;
    const baseAgentDomain = env().BASE_AGENT_DOMAIN;

    const allAgents = await db.query.agentsTable.findMany({
      where: and(eq(agentsTable.status, "active"), eq(agentsTable.isPublic, true)),
      columns: {
        id: true,
        handle: true,
        displayName: true,
        endpointUrl: true,
        chainRegistrations: true,
        trustScore: true,
        trustTier: true,
      },
    });

    const hostedAgents = allAgents.filter(a => {
      if (!a.endpointUrl) return true;
      try {
        const url = new URL(a.endpointUrl);
        return (
          url.hostname === baseAgentDomain ||
          url.hostname.endsWith(`.${baseAgentDomain}`)
        );
      } catch {
        return false;
      }
    });

    const registrations = hostedAgents.map(a => {
      const chainRegs = a.chainRegistrations as Record<string, unknown> | unknown[] | null;
      let chainRegistrations: Record<string, unknown>[] = [];
      if (chainRegs && typeof chainRegs === "object") {
        if (Array.isArray(chainRegs)) {
          chainRegistrations = (chainRegs as Record<string, unknown>[]).filter(
            e => e && typeof e === "object" && e.chain,
          );
        } else {
          chainRegistrations = Object.entries(chainRegs as Record<string, unknown>)
            .filter(([, v]) => v && typeof v === "object")
            .map(([chain, v]) => ({ chain, ...(v as Record<string, unknown>) }));
        }
      }

      return {
        handle: a.handle,
        did: `did:web:getagent.id:agents:${a.id}`,
        trustScore: a.trustScore,
        trustTier: a.trustTier,
        registrations: chainRegistrations,
      };
    });

    res.set("Content-Type", "application/json");
    res.set("Cache-Control", "public, max-age=3600");
    res.json({
      "@context": ["https://eips.ethereum.org/EIPS/eip-8004"],
      spec: "registration-v1",
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      domain: baseAgentDomain,
      resolverUrl: `${appUrl}/.well-known/agent-registration.json`,
      generatedAt: new Date().toISOString(),
      agentCount: registrations.length,
      registrations,
    });
  } catch (err) {
    next(err);
  }
}

export default router;
