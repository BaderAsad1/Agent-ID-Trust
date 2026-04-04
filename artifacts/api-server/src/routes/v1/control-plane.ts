import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../../middlewares/replit-auth";
import { publicRateLimit } from "../../middlewares/rate-limit";
import { AppError } from "../../middlewares/error-handler";
import {
  signControlPlaneInstruction,
  verifyControlPlaneInstruction,
} from "../../services/control-plane";
import { isAgentOwner } from "../../services/agents";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";

const instructionSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});

const verifySchema = z.object({
  token: z.string().min(1),
});

export const controlPlaneAgentRouter = Router();

controlPlaneAgentRouter.post(
  "/:agentId/control-plane/instruct",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agentId = req.params.agentId as string;

      const agent = await db.query.agentsTable.findFirst({
        where: eq(agentsTable.id, agentId),
      });

      if (!agent) {
        throw new AppError(404, "NOT_FOUND", "Agent not found");
      }

      if (!isAgentOwner(agent, req.userId!)) {
        throw new AppError(403, "FORBIDDEN", "You do not own this agent");
      }

      const parsed = instructionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "VALIDATION_ERROR", "Invalid instruction body", parsed.error.flatten());
      }

      const instruction = {
        type: parsed.data.type,
        agentId,
        payload: parsed.data.payload,
      };

      const result = await signControlPlaneInstruction(agentId, instruction);

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export const controlPlaneVerifyRouter = Router();

controlPlaneVerifyRouter.post(
  "/control-plane/verify",
  publicRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = verifySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "VALIDATION_ERROR", "Missing token field", parsed.error.flatten());
      }

      const result = await verifyControlPlaneInstruction(parsed.data.token as string);

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
