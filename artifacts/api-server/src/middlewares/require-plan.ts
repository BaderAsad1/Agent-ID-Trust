import type { Request, Response, NextFunction } from "express";
import { requirePlanFeature } from "../services/billing";

type PlanFeature = "canListOnMarketplace" | "canUsePremiumRouting" | "canUseAdvancedAuth" | "canUseTeamFeatures";

export function requirePlan(feature: PlanFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.userId) {
      res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
      return;
    }

    const result = await requirePlanFeature(req.userId, feature);
    if (!result.allowed) {
      res.status(403).json({
        error: `This feature requires the ${result.requiredPlan} plan or higher`,
        code: "PLAN_REQUIRED",
        currentPlan: result.currentPlan,
        requiredPlan: result.requiredPlan,
      });
      return;
    }

    next();
  };
}
