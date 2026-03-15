import { Router } from "express";
import { AppError } from "../../middlewares/error-handler";
import { getAgentByHandle, toPublicProfile } from "../../services/agents";
import {
  getActiveCredential,
  issueCredential,
  verifyCredentialSignature,
  buildErc8004,
} from "../../services/credentials";

const router = Router();

router.get("/:handle", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!agent || !agent.isPublic || agent.status !== "active") {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    res.json(toPublicProfile(agent));
  } catch (err) {
    next(err);
  }
});

router.get("/:handle/credential", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!agent || !agent.isPublic || agent.status !== "active") {
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
    if (!agent || !agent.isPublic || agent.status !== "active") {
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
