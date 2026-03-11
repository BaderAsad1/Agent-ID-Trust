import { Router } from "express";
import authRouter from "./auth";
import usersRouter from "./users";
import apiKeysRouter from "./api-keys";
import identitiesRouter from "./identities";
import agentsRouter from "./agents";
import handlesRouter from "./handles";
import publicProfilesRouter from "./public-profiles";
import programmaticRouter from "./programmatic";
import agentVerificationRouter from "./agent-verification";

const router = Router();

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/users/me/api-keys", apiKeysRouter);
router.use("/users/me/identities", identitiesRouter);
router.use("/agents", agentsRouter);
router.use("/agents", agentVerificationRouter);
router.use("/handles", handlesRouter);
router.use("/p", publicProfilesRouter);
router.use("/programmatic", programmaticRouter);

export default router;
