import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { humanProfilesTable, agentsTable } from "@workspace/db/schema";
import { AppError } from "../../middlewares/error-handler";
import { getAgentByHandle, toPublicProfile } from "../../services/agents";
import {
  getActiveCredential,
  issueCredential,
  verifyCredentialSignature,
  buildErc8004,
} from "../../services/credentials";
import { getActivityLog } from "../../services/activity-logger";
import { listListings } from "../../services/marketplace";
import { getReviewsByAgent } from "../../services/reviews";
import { deriveAnchorState } from "../../lib/anchor-state";
import { publicRateLimit } from "../../middlewares/rate-limit";

const router = Router();

/** Returns true if an agent row represents a live, serveable profile (active and handle not retired). */
function isAgentProfileActive(agent: Awaited<ReturnType<typeof getAgentByHandle>>): boolean {
  if (!agent || agent.status !== "active") return false;
  const hs = (agent as unknown as { handleStatus?: string | null }).handleStatus;
  if (hs === "retired") return false;
  return true;
}

router.get("/:handle", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);

    if (isAgentProfileActive(agent) && !agent!.isPublic) {
      throw new AppError(403, "AGENT_NOT_PUBLIC", "This agent profile is not public");
    }

    if (!isAgentProfileActive(agent)) {
      const handle = (req.params.handle as string).toLowerCase();
      const humanProfile = await db.query.humanProfilesTable.findFirst({
        where: eq(humanProfilesTable.handle, handle),
      });

      if (humanProfile && humanProfile.isPublic) {
        const ownedAgents = await db.query.agentsTable.findMany({
          where: eq(agentsTable.userId, humanProfile.ownerUserId),
          columns: {
            id: true,
            handle: true,
            displayName: true,
            description: true,
            avatarUrl: true,
            status: true,
            trustScore: true,
            verificationStatus: true,
            capabilities: true,
            isPublic: true,
          },
        });
        const publicAgents = ownedAgents.filter((a) => a.isPublic);

        res.json({
          type: "human",
          profile: {
            ...humanProfile,
            did: `did:web:getagent.id:humans:${humanProfile.id}`,
            handleAlias: `did:agentid:human:${humanProfile.handle}`,
          },
          agents: publicAgents,
          agentCount: publicAgents.length,
        });
        return;
      }

      throw new AppError(404, "NOT_FOUND", "Profile not found");
    }

    const [credential, activityResult, listingsResult, reviewsResult] =
      await Promise.all([
        getActiveCredential(agent.id).catch(() => null),
        getActivityLog(agent.id, 10).catch(() => []),
        listListings({ agentId: agent.id, limit: 10 }).catch(() => ({
          listings: [],
          total: 0,
        })),
        getReviewsByAgent(agent.id, 20).catch(() => ({
          reviews: [],
          total: 0,
        })),
      ]);

    const reviews = (reviewsResult.reviews || []) as Array<{ id: string; rating: number; comment: string | null; createdAt: Date }>;
    const avgRating =
      reviews.length > 0
        ? Math.round(
            (reviews.reduce((sum: number, r) => sum + (r.rating ?? 0), 0) /
              reviews.length) *
              100,
          ) / 100
        : null;

    const APP_URL = process.env.APP_URL || "https://getagent.id";

    const profile = toPublicProfile(
      agent,
      credential as Record<string, unknown> | null,
    );

    // Derive on-chain anchor state via shared helper (single source of truth)
    const agentAny = agent as unknown as { chainRegistrations?: unknown; nftStatus?: string };
    const {
      erc8004Status: profileErc8004Status,
      onchainStatus: profileOnchainStatus,
      onchainAnchor: profileOnchainAnchor,
      anchoringMethod: profileAnchoringMethod,
    } = deriveAnchorState(agentAny.chainRegistrations, agentAny.nftStatus);

    res.json({
      ...profile,
      recentActivity: activityResult,
      listings: listingsResult.listings || [],
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
      stats: {
        tasksCompleted: agent.tasksCompleted ?? 0,
        tasksReceived: agent.tasksReceived ?? 0,
        avgRating,
        uptimePct: null,
        avgResponseMs: null,
        uniqueClients: null,
      },
      credential: {
        ...(profile.credential || {}),
        did: `did:web:getagent.id:agents:${agent.id}`,
        domain: profile.agent.domainName || `${agent.handle}.getagent.id`,
        resolverUrl: `${APP_URL}/api/v1/resolve/${agent.handle}`,
        erc8004Uri: `${APP_URL}/api/v1/p/${agent.handle}/erc8004`,
        erc8004Status: profileErc8004Status,
        anchoringMethod: profileAnchoringMethod,
        onchainAnchor: profileOnchainAnchor,
        onchainStatus: profileOnchainStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:handle/credential", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!isAgentProfileActive(agent)) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!agent!.isPublic) {
      throw new AppError(403, "AGENT_NOT_PUBLIC", "This agent profile is not public");
    }

    const formatQuery = (req.query.format as string | undefined)?.toLowerCase();

    if (formatQuery === "jwt") {
      const { issueVerifiableCredential } = await import("../../services/verifiable-credential");
      const jwt = await issueVerifiableCredential(agent.id);
      res.set("Content-Type", "application/jwt");
      res.set("Cache-Control", "public, max-age=60");
      res.send(jwt);
      return;
    }

    const accept = req.headers.accept || "";
    if (accept.includes("application/json") && !accept.includes("application/jwt")) {
      let credential = await getActiveCredential(agent.id);
      if (!credential) {
        credential = await issueCredential(agent.id);
      }
      res.set("Cache-Control", "public, max-age=60");
      res.json(credential);
      return;
    }

    const { issueVerifiableCredential } = await import("../../services/verifiable-credential");
    const jwt = await issueVerifiableCredential(agent.id);
    res.set("Content-Type", "application/jwt");
    res.set("Cache-Control", "public, max-age=60");
    res.send(jwt);
  } catch (err) {
    next(err);
  }
});

router.get("/:handle/credential/jwt", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!isAgentProfileActive(agent)) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!agent!.isPublic) {
      throw new AppError(403, "AGENT_NOT_PUBLIC", "This agent profile is not public");
    }

    const { issueVerifiableCredential } = await import("../../services/verifiable-credential");
    const jwt = await issueVerifiableCredential(agent.id);
    res.set("Content-Type", "application/jwt");
    res.set("Cache-Control", "public, max-age=60");
    res.send(jwt);
  } catch (err) {
    next(err);
  }
});

router.get("/:handle/activity", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!isAgentProfileActive(agent)) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!agent!.isPublic) {
      throw new AppError(403, "AGENT_NOT_PUBLIC", "This agent profile is not public");
    }

    const { getPublicSignedActivityLog } = await import("../../services/activity-log");
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const result = await getPublicSignedActivityLog(agent.id, limit, offset);

    res.json({ activities: result.activities, total: result.total, limit, offset });
  } catch (err) {
    next(err);
  }
});

router.get("/:handle/credential/verify", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!isAgentProfileActive(agent)) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!agent!.isPublic) {
      throw new AppError(403, "AGENT_NOT_PUBLIC", "This agent profile is not public");
    }

    const credentialBody = req.body;
    if (!credentialBody || typeof credentialBody !== "object" || Object.keys(credentialBody).length === 0) {
      const credential = await getActiveCredential(agent.id);
      if (!credential) {
        res.json({ valid: false, reason: "No active credential found" });
        return;
      }
      const result = verifyCredentialSignature(credential as Record<string, unknown>);
      res.json({ ...result, credential });
      return;
    }

    const subject = (credentialBody as Record<string, unknown>).credentialSubject as Record<string, unknown> | undefined;
    if (subject && subject.handle && subject.handle !== agent.handle) {
      res.json({ valid: false, reason: "Credential subject does not match the requested agent handle" });
      return;
    }

    const result = verifyCredentialSignature(credentialBody as Record<string, unknown>);
    if (result.valid) {
      res.json({ ...result, credential: credentialBody });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/:handle/credential/verify", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!isAgentProfileActive(agent)) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }
    if (!agent!.isPublic) {
      throw new AppError(403, "AGENT_NOT_PUBLIC", "This agent profile is not public");
    }

    const credentialBody = req.body;
    if (!credentialBody || typeof credentialBody !== "object" || Object.keys(credentialBody).length === 0) {
      const credential = await getActiveCredential(agent.id);
      if (!credential) {
        res.json({ valid: false, reason: "No active credential found" });
        return;
      }
      const result = verifyCredentialSignature(credential as Record<string, unknown>);
      res.json({ ...result, credential });
      return;
    }

    const subject = (credentialBody as Record<string, unknown>).credentialSubject as Record<string, unknown> | undefined;
    if (subject && subject.handle && subject.handle !== agent.handle) {
      res.json({ valid: false, reason: "Credential subject does not match the requested agent handle" });
      return;
    }

    const result = verifyCredentialSignature(credentialBody as Record<string, unknown>);
    if (result.valid) {
      res.json({ ...result, credential: credentialBody });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

async function handleErc8004(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  try {
    const handle = (req.params.handle as string).toLowerCase().trim();
    const erc8004 = await buildErc8004(handle);

    if (erc8004) {
      res.set("Content-Type", "application/json");
      res.set("Cache-Control", "public, max-age=300");
      res.json(erc8004);
      return;
    }

    // Handle exists as a valid string but isn't registered in the platform DB.
    // Return an "unreconciled" ERC-8004 stub — the handle may exist on-chain but not yet
    // reconciled to our DB. Returning registered:false would be a false-negative for
    // direct/manual on-chain registrations that haven't been reconciled yet.
    const APP_URL = process.env.APP_URL || "https://getagent.id";
    const stub = {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://eips.ethereum.org/EIPS/eip-8004",
      ],
      spec: "registration-v1",
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      id: `did:agentid:${handle}`,
      alsoKnownAs: [`did:agentid:${handle}`],
      name: handle,
      image: `${APP_URL}/api/v1/handles/${handle}/image.svg`,
      active: false,
      registered: null,
      agentid: {
        handle,
        handleAlias: `did:agentid:${handle}`,
        status: "unreconciled",
      },
    };

    res.set("Content-Type", "application/json");
    res.set("Cache-Control", "public, max-age=60");
    res.json(stub);
  } catch (err) {
    next(err);
  }
}

router.get("/:handle/erc8004", publicRateLimit, handleErc8004);

export default router;

export { handleErc8004 };
