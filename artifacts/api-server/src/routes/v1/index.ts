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
import tasksRouter from "./tasks";
import dashboardRouter from "./dashboard";
import billingRouter from "./billing";
import webhooksRouter from "./webhooks";
import domainsRouter from "./domains";

const router = Router();

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/users/me/api-keys", apiKeysRouter);
router.use("/users/me/identities", identitiesRouter);
router.use("/agents", agentsRouter);
router.use("/agents", agentVerificationRouter);
router.use("/agents", domainsRouter);
router.use("/handles", handlesRouter);
router.use("/p", publicProfilesRouter);
router.use("/programmatic", programmaticRouter);
router.use("/tasks", tasksRouter);
router.use("/dashboard", dashboardRouter);
router.use("/billing", billingRouter);
router.use("/webhooks", webhooksRouter);
router.use("/domains", domainsRouter);

export default router;
