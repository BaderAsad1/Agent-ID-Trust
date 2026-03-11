import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import {
  createJob,
  updateJob,
  updateJobStatus,
  getJobById,
  listJobs,
  getMyJobs,
} from "../../services/jobs";
import {
  createProposal,
  updateProposalStatus,
  withdrawProposal,
  getProposalsByJob,
  getMyProposals,
} from "../../services/proposals";

const router = Router();

const createJobSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  budgetMin: z.string().optional(),
  budgetMax: z.string().optional(),
  budgetFixed: z.string().optional(),
  deadlineHours: z.number().int().positive().optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  minTrustScore: z.number().int().min(0).max(100).optional(),
  verifiedOnly: z.boolean().optional(),
});

const updateJobSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  budgetMin: z.string().optional(),
  budgetMax: z.string().optional(),
  budgetFixed: z.string().optional(),
  deadlineHours: z.number().int().positive().optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  minTrustScore: z.number().int().min(0).max(100).optional(),
  verifiedOnly: z.boolean().optional(),
});

router.get("/", async (req, res, next) => {
  try {
    const filters = {
      category: req.query.category as string | undefined,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
      budgetMin: req.query.budgetMin ? Number(req.query.budgetMin) : undefined,
      budgetMax: req.query.budgetMax ? Number(req.query.budgetMax) : undefined,
      capability: req.query.capability as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      sortBy: req.query.sortBy as "created" | "budget" | "deadline" | "proposals" | undefined,
      sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
    };
    const result = await listJobs(filters);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const jobs = await getMyJobs(req.userId!);
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

router.get("/proposals/mine", requireAuth, async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const result = await getMyProposals(req.userId!, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:jobId", async (req, res, next) => {
  try {
    const job = await getJobById(req.params.jobId as string);
    if (!job) throw new AppError(404, "NOT_FOUND", "Job not found");
    res.json(job);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createJobSchema.parse(req.body);
    const result = await createJob({ ...parsed, posterUserId: req.userId! });
    if (!result.success) {
      throw new AppError(400, result.error!, result.error!);
    }
    res.status(201).json(result.job);
  } catch (err) {
    next(err);
  }
});

router.patch("/:jobId", requireAuth, async (req, res, next) => {
  try {
    const parsed = updateJobSchema.parse(req.body);
    const result = await updateJob(req.params.jobId as string, req.userId!, parsed);
    if (!result.success) {
      const code = result.error === "JOB_NOT_FOUND" ? 404 : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.job);
  } catch (err) {
    next(err);
  }
});

router.patch("/:jobId/status", requireAuth, async (req, res, next) => {
  try {
    const statusSchema = z.object({
      status: z.enum(["filled", "closed", "expired"]),
    });
    const { status } = statusSchema.parse(req.body);
    const result = await updateJobStatus(req.params.jobId as string, req.userId!, status);
    if (!result.success) {
      const code = result.error === "JOB_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.job);
  } catch (err) {
    next(err);
  }
});

router.get("/:jobId/proposals", async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const result = await getProposalsByJob(req.params.jobId as string, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const createProposalSchema = z.object({
  agentId: z.string().uuid(),
  approach: z.string().optional(),
  priceAmount: z.string().optional(),
  deliveryHours: z.number().int().positive().optional(),
});

router.post("/:jobId/proposals", requireAuth, async (req, res, next) => {
  try {
    const parsed = createProposalSchema.parse(req.body);
    const result = await createProposal({
      ...parsed,
      jobId: req.params.jobId as string,
      userId: req.userId!,
    });
    if (!result.success) {
      const code = result.error === "JOB_NOT_FOUND" ? 404
        : result.error === "AGENT_NOT_FOUND" ? 404
        : result.error === "CANNOT_PROPOSE_OWN_JOB" ? 403
        : result.error === "AGENT_NOT_ACTIVE" ? 403
        : result.error === "VERIFIED_ONLY" ? 403
        : result.error?.startsWith("TRUST_SCORE_TOO_LOW") ? 403
        : result.error?.startsWith("MISSING_CAPABILITIES") ? 403
        : result.error === "JOB_NOT_OPEN" ? 409
        : result.error === "DUPLICATE_PROPOSAL" ? 409
        : 400;
      throw new AppError(code, result.error!, result.error!);
    }
    res.status(201).json(result.proposal);
  } catch (err) {
    next(err);
  }
});

const updateProposalStatusSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

router.patch("/:jobId/proposals/:proposalId", requireAuth, async (req, res, next) => {
  try {
    const { status } = updateProposalStatusSchema.parse(req.body);
    const result = await updateProposalStatus(
      req.params.jobId as string,
      req.params.proposalId as string,
      req.userId!,
      status,
    );
    if (!result.success) {
      const code = result.error === "JOB_NOT_FOUND" ? 404
        : result.error === "PROPOSAL_NOT_FOUND" ? 404
        : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.proposal);
  } catch (err) {
    next(err);
  }
});

router.post("/:jobId/proposals/:proposalId/withdraw", requireAuth, async (req, res, next) => {
  try {
    const result = await withdrawProposal(
      req.params.jobId as string,
      req.params.proposalId as string,
      req.userId!,
    );
    if (!result.success) {
      const code = result.error === "PROPOSAL_NOT_FOUND" ? 404 : 409;
      throw new AppError(code, result.error!, result.error!);
    }
    res.json(result.proposal);
  } catch (err) {
    next(err);
  }
});

export default router;
