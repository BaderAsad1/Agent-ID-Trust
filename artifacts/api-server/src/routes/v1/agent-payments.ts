import { Router } from "express";
import { requireAuth } from "../../middlewares/replit-auth";
import { validateUuidParam } from "../../middlewares/validation";
import { AppError } from "../../middlewares/error-handler";
import { getAgentById, isAgentOwner } from "../../services/agents";
import {
  createConnectAccount,
  createOnboardingLink,
  getConnectAccountStatus,
} from "../../services/stripe-connect";

const router = Router();

router.post(
  "/:agentId/payment/onboard",
  requireAuth,
  validateUuidParam("agentId"),
  async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const agent = await getAgentById(agentId);
      if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");
      if (!isAgentOwner(agent, req.userId!)) throw new AppError(403, "FORBIDDEN", "You do not own this agent");

      const { accountId } = await createConnectAccount(agentId, req.userId!);

      const appBaseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const returnUrl = `${appBaseUrl}/dashboard?connect=complete&agentId=${agentId}`;
      const refreshUrl = `${appBaseUrl}/api/v1/agents/${agentId}/payment/onboard-refresh`;

      const onboardingUrl = await createOnboardingLink(accountId, returnUrl, refreshUrl);

      res.json({ onboardingUrl, accountId });
    } catch (err) {
      if (err instanceof Error && err.message === "NOT_OWNER") {
        return next(new AppError(403, "FORBIDDEN", "You do not own this agent"));
      }
      next(err);
    }
  },
);

router.get(
  "/:agentId/payment/onboard-refresh",
  requireAuth,
  validateUuidParam("agentId"),
  async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const agent = await getAgentById(agentId);
      if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");
      if (!isAgentOwner(agent, req.userId!)) throw new AppError(403, "FORBIDDEN", "You do not own this agent");

      if (!agent.stripeConnectAccountId) {
        throw new AppError(400, "NOT_CONNECTED", "Agent has no Stripe Connect account");
      }

      const appBaseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const returnUrl = `${appBaseUrl}/dashboard?connect=complete&agentId=${agentId}`;
      const refreshUrl = `${appBaseUrl}/api/v1/agents/${agentId}/payment/onboard-refresh`;

      const onboardingUrl = await createOnboardingLink(
        agent.stripeConnectAccountId,
        returnUrl,
        refreshUrl,
      );

      res.redirect(onboardingUrl);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:agentId/payment/status",
  requireAuth,
  validateUuidParam("agentId"),
  async (req, res, next) => {
    try {
      const agentId = req.params.agentId as string;
      const agent = await getAgentById(agentId);
      if (!agent) throw new AppError(404, "NOT_FOUND", "Agent not found");
      if (!isAgentOwner(agent, req.userId!)) throw new AppError(403, "FORBIDDEN", "You do not own this agent");

      const status = await getConnectAccountStatus(agentId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
