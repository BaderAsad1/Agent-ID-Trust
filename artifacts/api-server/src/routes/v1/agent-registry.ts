import { Router } from "express";
import { requireAuth } from "../../middlewares/replit-auth";
import { getRegistryStatus } from "../../services/agent-registry";

const router = Router();

router.get("/:agentId/registry/status", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.params.agentId as string;
    const status = await getRegistryStatus(agentId, req.userId!);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
