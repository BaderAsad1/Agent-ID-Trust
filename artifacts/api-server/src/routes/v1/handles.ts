import { Router } from "express";
import { z } from "zod/v4";
import { AppError } from "../../middlewares/error-handler";
import { validateHandle, isHandleAvailable } from "../../services/agents";

const router = Router();

const checkHandleSchema = z.object({
  handle: z.string().min(1).max(100),
});

router.get("/check", async (req, res, next) => {
  try {
    const parsed = checkHandleSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "handle query parameter is required");
    }

    const { handle } = parsed.data;
    const validationError = validateHandle(handle.toLowerCase());
    if (validationError) {
      res.json({ available: false, handle, reason: validationError });
      return;
    }

    const available = await isHandleAvailable(handle);
    res.json({ available, handle: handle.toLowerCase() });
  } catch (err) {
    next(err);
  }
});

export default router;
