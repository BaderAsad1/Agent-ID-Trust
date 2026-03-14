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
import agentIdentityRouter from "./agent-identity";
import agentSpawnRouter from "./agent-spawn";
import tasksRouter from "./tasks";
import dashboardRouter from "./dashboard";
import billingRouter from "./billing";
import webhooksRouter from "./webhooks";
import agentDomainsRouter from "./domains";
import domainResolveRouter from "./domain-resolve";
import marketplaceRouter from "./marketplace";
import paymentsRouter from "./payments";
import jobsRouter from "./jobs";
import mailRouter from "./mail";
import resolveRouter, { handleReverse, handleAgentDiscovery } from "./resolve";

const router = Router();

router.use("/resolve", resolveRouter);
router.post("/reverse", handleReverse);
router.get("/agents", (req, res, next) => {
  const hasDiscoveryParams = req.query.capability || req.query.minTrust || req.query.protocol || req.query.verifiedOnly || req.query.limit || req.query.offset;
  const hasAuthHeader = req.headers["x-replit-user-id"] || req.headers["x-agentid-user-id"] || req.headers["authorization"];
  if (hasDiscoveryParams && !hasAuthHeader) {
    return handleAgentDiscovery(req, res, next);
  }
  next();
});
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/users/me/api-keys", apiKeysRouter);
router.use("/users/me/identities", identitiesRouter);
router.use("/agents", agentsRouter);
router.use("/agents", agentVerificationRouter);
router.use("/agents", agentDomainsRouter);
router.use("/agents", agentSpawnRouter);
router.use("/handles", handlesRouter);
router.use("/p", publicProfilesRouter);
router.use("/public/agents", agentIdentityRouter);
router.use("/programmatic", programmaticRouter);
router.use("/tasks", tasksRouter);
router.use("/dashboard", dashboardRouter);
router.use("/billing", billingRouter);
router.use("/webhooks", webhooksRouter);
router.use("/domains", domainResolveRouter);
router.use("/marketplace", marketplaceRouter);
router.use("/payments", paymentsRouter);
router.use("/jobs", jobsRouter);
router.use("/mail", mailRouter);

export default router;
