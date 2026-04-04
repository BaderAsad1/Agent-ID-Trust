import type { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { getUserPlan, getPlanLimits } from "../services/billing";
import { getAgentAuthorization } from "../services/agentic-payment";

const APP_URL = () => process.env.APP_URL || "https://getagent.id";

const PLAN_ORDER = ["none", "free", "starter", "pro", "enterprise"];

function planMeetsMinimum(currentPlan: string, minPlan: string): boolean {
  const normalized = currentPlan === "builder" ? "starter" : currentPlan === "team" ? "pro" : currentPlan;
  const currentIdx = PLAN_ORDER.indexOf(normalized);
  const minIdx = PLAN_ORDER.indexOf(minPlan);
  if (currentIdx === -1) return false;
  if (minIdx === -1) return true;
  return currentIdx >= minIdx;
}

const UPGRADE_PLANS = [
  { id: "starter", name: "Starter", monthlyUsd: 29, yearlyUsd: 290, features: ["5 agents", "Inbox", "Tasks", "Standard handle included"] },
  { id: "pro", name: "Pro", monthlyUsd: 79, yearlyUsd: 790, features: ["25 agents", "Fleet management", "Analytics", "Custom domains"] },
] as const;

export function requirePlan(minPlan: "starter" | "pro" | "enterprise") {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.LAUNCH_MODE === "true") {
      return next();
    }

    if (!req.userId) {
      res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
        upgradeUrl: `${APP_URL()}/pricing`,
        paymentOptions: `${APP_URL()}/api/v1/pay/options`,
      });
      return;
    }

    const plan = await getUserPlan(req.userId);

    if (!planMeetsMinimum(plan, minPlan)) {
      const planNames: Record<string, string> = {
        starter: "Starter ($29/mo)",
        pro: "Pro ($79/mo)",
        enterprise: "Enterprise",
      };

      res.status(403).json({
        error: `This feature requires the ${planNames[minPlan] ?? minPlan} plan or higher`,
        code: "PLAN_REQUIRED",
        currentPlan: plan,
        requiredPlan: minPlan,
        upgradeUrl: `${APP_URL()}/pricing`,
        paymentOptions: `${APP_URL()}/api/v1/pay/options`,
        plans: UPGRADE_PLANS,
      });
      return;
    }

    next();
  };
}

export function requireAgentPlan(minPlan: "starter" | "pro" = "starter") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const agentId = req.authenticatedAgent?.id;

    if (!agentId) {
      if (!req.userId) {
        res.status(401).json({
          error: "Authentication required",
          code: "AUTH_REQUIRED",
          upgradeUrl: `${APP_URL()}/pricing`,
          paymentOptions: `${APP_URL()}/api/v1/pay/options`,
        });
        return;
      }

      const plan = await getUserPlan(req.userId);
      if (!planMeetsMinimum(plan, minPlan)) {
        res.status(403).json({
          error: "Plan upgrade required to access this feature",
          code: "PLAN_REQUIRED",
          currentPlan: plan,
          requiredPlan: minPlan,
          upgradeUrl: `${APP_URL()}/pricing`,
          paymentOptions: `${APP_URL()}/api/v1/pay/options`,
        });
        return;
      }
      return next();
    }

    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { userId: true, planTier: true },
    });

    if (!agent) {
      res.status(404).json({ error: "Agent not found", code: "NOT_FOUND" });
      return;
    }

    const agentPlan = agent.planTier ?? null;
    const userPlan = await getUserPlan(agent.userId);
    const effectivePlan = agentPlan ?? userPlan;

    if (!planMeetsMinimum(effectivePlan, minPlan)) {
      res.status(403).json({
        error: `Agent plan upgrade required. This feature requires ${minPlan} or above.`,
        code: "AGENT_PLAN_REQUIRED",
        agentId,
        currentPlan: effectivePlan,
        requiredPlan: minPlan,
        upgradeUrl: `${APP_URL()}/pricing`,
        paymentOptions: `${APP_URL()}/api/v1/pay/options`,
        agenticUpgrade: `POST ${APP_URL()}/api/v1/pay/upgrade`,
        plans: UPGRADE_PLANS,
      });
      return;
    }

    next();
  };
}

export function requireInboxAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const agentId = req.authenticatedAgent?.id;

    if (agentId) {
      const agent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, agentId),
        columns: { userId: true, inboxActive: true, planTier: true },
      });

      if (!agent) {
        res.status(404).json({ error: "Agent not found", code: "NOT_FOUND" });
        return;
      }

      const userPlan = await getUserPlan(agent.userId);
      const limits = getPlanLimits(userPlan);

      if (!limits.canReceiveMail) {
        res.status(403).json({
          error: "Inbox access requires a Starter plan or above",
          code: "INBOX_PLAN_REQUIRED",
          agentId,
          currentPlan: userPlan,
          requiredPlan: "starter",
          upgradeUrl: `${APP_URL()}/pricing`,
          paymentOptions: `${APP_URL()}/api/v1/pay/options`,
          agenticUpgrade: `POST ${APP_URL()}/api/v1/pay/upgrade`,
        });
        return;
      }
      return next();
    }

    if (!req.userId) {
      res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
        upgradeUrl: `${APP_URL()}/pricing`,
        paymentOptions: `${APP_URL()}/api/v1/pay/options`,
      });
      return;
    }

    const plan = await getUserPlan(req.userId);
    const limits = getPlanLimits(plan);

    if (!limits.canReceiveMail) {
      res.status(403).json({
        error: "Inbox access requires a Starter plan or above",
        code: "INBOX_PLAN_REQUIRED",
        currentPlan: plan,
        requiredPlan: "starter",
        upgradeUrl: `${APP_URL()}/pricing`,
        paymentOptions: `${APP_URL()}/api/v1/pay/options`,
        plans: UPGRADE_PLANS,
      });
      return;
    }

    next();
  };
}

export function checkAgentLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return next();
    }

    const plan = await getUserPlan(req.userId);
    const limits = getPlanLimits(plan);

    const existingAgents = await db.select({ id: agentsTable.id }).from(agentsTable)
      .where(and(eq(agentsTable.userId, req.userId), eq(agentsTable.status, "active")));

    if (existingAgents.length >= limits.agentLimit) {
      res.status(403).json({
        error: `Agent limit reached. Your ${plan} plan allows ${limits.agentLimit} agent(s).`,
        code: "AGENT_LIMIT_REACHED",
        currentPlan: plan,
        agentLimit: limits.agentLimit,
        currentCount: existingAgents.length,
        upgradeUrl: `${APP_URL()}/pricing`,
        paymentOptions: `${APP_URL()}/api/v1/pay/options`,
      });
      return;
    }

    next();
  };
}
