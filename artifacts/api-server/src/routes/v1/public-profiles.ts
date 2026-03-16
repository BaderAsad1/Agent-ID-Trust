import { Router } from "express";
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

const router = Router();

router.get("/:handle", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!agent || agent.status !== "active") {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
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
        did: `did:agentid:${agent.handle}`,
        domain: profile.agent.domainName || `${agent.handle}.getagent.id`,
        resolverUrl: `${APP_URL}/api/v1/p/${agent.handle}/erc8004`,
        erc8004Uri: `${APP_URL}/api/v1/p/${agent.handle}/erc8004`,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:handle/credential", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!agent || agent.status !== "active") {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    let credential = await getActiveCredential(agent.id);
    if (!credential) {
      credential = await issueCredential(agent.id);
    }

    res.set("Cache-Control", "public, max-age=60");
    res.json(credential);
  } catch (err) {
    next(err);
  }
});

router.get("/:handle/credential/verify", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!agent || agent.status !== "active") {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
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
    if (!agent || agent.status !== "active") {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
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

router.get("/:handle/erc8004", async (req, res, next) => {
  try {
    const erc8004 = await buildErc8004(req.params.handle as string);
    if (!erc8004) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    res.set("Content-Type", "application/json");
    res.set("Cache-Control", "public, max-age=300");
    res.json(erc8004);
  } catch (err) {
    next(err);
  }
});

export default router;
