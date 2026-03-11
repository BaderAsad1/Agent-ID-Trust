import { Router } from "express";
import { AppError } from "../../middlewares/error-handler";
import { getAgentByHandle, toPublicProfile } from "../../services/agents";

const router = Router();

router.get("/:handle", async (req, res, next) => {
  try {
    const agent = await getAgentByHandle(req.params.handle as string);
    if (!agent || !agent.isPublic) {
      throw new AppError(404, "NOT_FOUND", "Agent not found");
    }

    res.json(toPublicProfile(agent));
  } catch (err) {
    next(err);
  }
});

export default router;
