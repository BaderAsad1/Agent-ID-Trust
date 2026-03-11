import { Router } from "express";
import { AppError } from "../../middlewares/error-handler";
import { resolveDomain } from "../../services/domains";

const router = Router();

router.get("/resolve/:domain", async (req, res, next) => {
  try {
    const domain = req.params.domain as string;
    const result = await resolveDomain(domain);
    if (!result) {
      throw new AppError(404, "NOT_FOUND", "Domain not found");
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
