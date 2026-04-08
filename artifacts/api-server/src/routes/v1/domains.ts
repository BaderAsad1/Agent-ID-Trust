import { Router } from "express";
import { requireAuth } from "../../middlewares/replit-auth";
import { requirePlan } from "../../middlewares/feature-gate";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import {
  getAgentDomain,
  getDomainStatus,
  provisionDomain,
  reprovisionDomain,
} from "../../services/domains";

const router = Router();

router.get("/:agentId/domain", requireAuth, requirePlan("pro"), validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const domain = await getAgentDomain(agentId, req.userId!);
    if (!domain) {
      throw new AppError(404, "NOT_FOUND", "No domain configured for this agent");
    }
    res.json(domain);
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/domain/status", requireAuth, requirePlan("pro"), validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const status = await getDomainStatus(agentId, req.userId!);
    if (!status) {
      throw new AppError(404, "NOT_FOUND", "No domain configured for this agent");
    }
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/domain/provision", requireAuth, requirePlan("pro"), validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const result = await provisionDomain(agentId, req.userId!);
    if (!result.success) {
      const code = result.error === "AGENT_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.status(201).json(result.domain);
  } catch (err) {
    next(err);
  }
});

router.post("/:agentId/domain/reprovision", requireAuth, requirePlan("pro"), validateUuidParam("agentId"), async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const result = await reprovisionDomain(agentId, req.userId!);
    if (!result.success) {
      const code = result.error === "AGENT_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.domain);
  } catch (err) {
    next(err);
  }
});

export default router;
