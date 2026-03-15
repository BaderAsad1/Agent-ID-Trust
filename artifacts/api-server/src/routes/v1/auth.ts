import { Router } from "express";
import { requireAuth } from "../../middlewares/replit-auth";

const router = Router();

router.get("/me", requireAuth, (req, res) => {
  const user = req.user!;
  const response: Record<string, unknown> = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    plan: user.plan,
    createdAt: user.createdAt.toISOString(),
  };
  if (process.env.NODE_ENV !== "production") {
    response.replitUserId = user.replitUserId;
  }
  res.json(response);
});

export default router;
