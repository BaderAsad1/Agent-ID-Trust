import { Router } from "express";
import { requireAuth } from "../../middlewares/replit-auth";

const router = Router();

router.get("/me", requireAuth, (req, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    replitUserId: user.replitUserId,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    plan: user.plan,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
