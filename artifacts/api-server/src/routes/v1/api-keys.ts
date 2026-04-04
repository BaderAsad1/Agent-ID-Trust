import { Router } from "express";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { validateUuidParam } from "../../middlewares/validation";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "../../services/api-keys";
import { z } from "zod/v4";

const router = Router();

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).optional(),
  sandbox: z.boolean().optional(),
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const result = await createApiKey({
      ownerType: "user",
      ownerId: req.user!.id,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      sandbox: parsed.data.sandbox,
    });

    res.status(201).json({
      id: result.apiKey.id,
      name: result.apiKey.name,
      keyPrefix: result.apiKey.keyPrefix,
      scopes: result.apiKey.scopes,
      createdAt: result.apiKey.createdAt.toISOString(),
      key: result.rawKey,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const keys = await listApiKeys("user", req.user!.id);

    res.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        lastUsedAt: k.lastUsedAt?.toISOString() || null,
        createdAt: k.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:keyId", requireAuth, validateUuidParam("keyId"), async (req, res, next) => {
  try {
    const keyId = req.params.keyId as string;
    const revoked = await revokeApiKey(keyId, req.user!.id);
    if (!revoked) {
      throw new AppError(404, "NOT_FOUND", "API key not found or already revoked");
    }

    res.json({ message: "API key revoked" });
  } catch (err) {
    next(err);
  }
});

export default router;
