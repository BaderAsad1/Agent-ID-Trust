import { eq, and, desc, sql, ilike, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  jobPostsTable,
  jobProposalsTable,
  auditEventsTable,
  type JobPost,
} from "@workspace/db/schema";

async function logJobEvent(
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditEventsTable).values({
    actorType: "user",
    actorId: userId,
    eventType,
    payload,
  });
}

export interface CreateJobInput {
  posterUserId: string;
  title: string;
  description?: string;
  category?: string;
  budgetMin?: string;
  budgetMax?: string;
  budgetFixed?: string;
  deadlineHours?: number;
  requiredCapabilities?: string[];
  minTrustScore?: number;
  verifiedOnly?: boolean;
  expiresAt?: Date;
}

export interface UpdateJobInput {
  title?: string;
  description?: string;
  category?: string;
  budgetMin?: string;
  budgetMax?: string;
  budgetFixed?: string;
  deadlineHours?: number;
  requiredCapabilities?: string[];
  minTrustScore?: number;
  verifiedOnly?: boolean;
  expiresAt?: Date;
}

export interface JobFilters {
  category?: string;
  status?: string;
  budgetMin?: number;
  budgetMax?: number;
  capability?: string;
  search?: string;
  posterUserId?: string;
  limit?: number;
  offset?: number;
  sortBy?: "created" | "budget" | "deadline" | "proposals";
  sortOrder?: "asc" | "desc";
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["filled", "closed", "expired"],
  filled: ["closed"],
  closed: [],
  expired: [],
};

export async function createJob(
  input: CreateJobInput,
): Promise<{ success: boolean; job?: JobPost; error?: string }> {
  if (!input.title || input.title.trim().length === 0) {
    return { success: false, error: "TITLE_REQUIRED" };
  }

  const hasBudget = input.budgetFixed || (input.budgetMin && input.budgetMax);
  if (!hasBudget) {
    return { success: false, error: "BUDGET_REQUIRED" };
  }

  if (input.budgetMin && input.budgetMax) {
    if (Number(input.budgetMin) > Number(input.budgetMax)) {
      return { success: false, error: "INVALID_BUDGET_RANGE" };
    }
  }

  let expiresAt = input.expiresAt;
  if (!expiresAt && input.deadlineHours) {
    expiresAt = new Date(Date.now() + input.deadlineHours * 60 * 60 * 1000);
  }

  const [job] = await db
    .insert(jobPostsTable)
    .values({
      posterUserId: input.posterUserId,
      title: input.title.trim(),
      description: input.description,
      category: input.category,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      budgetFixed: input.budgetFixed,
      deadlineHours: input.deadlineHours,
      requiredCapabilities: input.requiredCapabilities ?? [],
      minTrustScore: input.minTrustScore,
      verifiedOnly: input.verifiedOnly ?? false,
      status: "open",
      proposalsCount: 0,
      expiresAt,
    })
    .returning();

  await logJobEvent(input.posterUserId, "job.created", {
    jobId: job.id,
    title: job.title,
    category: job.category,
  });

  return { success: true, job };
}

export async function updateJob(
  jobId: string,
  posterUserId: string,
  updates: UpdateJobInput,
): Promise<{ success: boolean; job?: JobPost; error?: string }> {
  const existing = await db.query.jobPostsTable.findFirst({
    where: and(
      eq(jobPostsTable.id, jobId),
      eq(jobPostsTable.posterUserId, posterUserId),
    ),
  });

  if (!existing) return { success: false, error: "JOB_NOT_FOUND" };
  if (existing.status !== "open") {
    return { success: false, error: "JOB_NOT_EDITABLE" };
  }

  const setValues: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.title !== undefined) setValues.title = updates.title.trim();
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.category !== undefined) setValues.category = updates.category;
  if (updates.budgetMin !== undefined) setValues.budgetMin = updates.budgetMin;
  if (updates.budgetMax !== undefined) setValues.budgetMax = updates.budgetMax;
  if (updates.budgetFixed !== undefined) setValues.budgetFixed = updates.budgetFixed;
  if (updates.deadlineHours !== undefined) setValues.deadlineHours = updates.deadlineHours;
  if (updates.requiredCapabilities !== undefined) setValues.requiredCapabilities = updates.requiredCapabilities;
  if (updates.minTrustScore !== undefined) setValues.minTrustScore = updates.minTrustScore;
  if (updates.verifiedOnly !== undefined) setValues.verifiedOnly = updates.verifiedOnly;
  if (updates.expiresAt !== undefined) setValues.expiresAt = updates.expiresAt;

  const [updated] = await db
    .update(jobPostsTable)
    .set(setValues)
    .where(eq(jobPostsTable.id, jobId))
    .returning();

  return { success: true, job: updated };
}

export async function updateJobStatus(
  jobId: string,
  posterUserId: string,
  newStatus: string,
): Promise<{ success: boolean; job?: JobPost; error?: string }> {
  const existing = await db.query.jobPostsTable.findFirst({
    where: and(
      eq(jobPostsTable.id, jobId),
      eq(jobPostsTable.posterUserId, posterUserId),
    ),
  });

  if (!existing) return { success: false, error: "JOB_NOT_FOUND" };

  const allowed = VALID_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `INVALID_TRANSITION:${existing.status}→${newStatus}`,
    };
  }

  const [updated] = await db
    .update(jobPostsTable)
    .set({ status: newStatus as "open" | "filled" | "closed" | "expired", updatedAt: new Date() })
    .where(eq(jobPostsTable.id, jobId))
    .returning();

  await logJobEvent(posterUserId, "job.status_changed", {
    jobId,
    title: existing.title,
    from: existing.status,
    to: newStatus,
  });

  return { success: true, job: updated };
}

export async function getJobById(jobId: string): Promise<JobPost | null> {
  const job = await db.query.jobPostsTable.findFirst({
    where: eq(jobPostsTable.id, jobId),
  });
  return job ?? null;
}

export async function listJobs(
  filters: JobFilters,
): Promise<{ jobs: JobPost[]; total: number }> {
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(jobPostsTable.status, filters.status as "open" | "filled" | "closed" | "expired"));
  } else {
    conditions.push(eq(jobPostsTable.status, "open"));
  }

  if (filters.category) {
    conditions.push(eq(jobPostsTable.category, filters.category));
  }
  if (filters.posterUserId) {
    conditions.push(eq(jobPostsTable.posterUserId, filters.posterUserId));
  }
  if (filters.search) {
    conditions.push(ilike(jobPostsTable.title, `%${filters.search}%`));
  }
  if (filters.budgetMin !== undefined) {
    conditions.push(
      sql`COALESCE(${jobPostsTable.budgetFixed}, ${jobPostsTable.budgetMax}) >= ${filters.budgetMin}`,
    );
  }
  if (filters.budgetMax !== undefined) {
    conditions.push(
      sql`COALESCE(${jobPostsTable.budgetFixed}, ${jobPostsTable.budgetMin}) <= ${filters.budgetMax}`,
    );
  }
  if (filters.capability) {
    conditions.push(
      sql`${jobPostsTable.requiredCapabilities}::jsonb @> ${JSON.stringify([filters.capability])}::jsonb`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let orderBy;
  const dir = filters.sortOrder === "asc" ? sql`ASC` : sql`DESC`;
  switch (filters.sortBy) {
    case "budget":
      orderBy = sql`COALESCE(${jobPostsTable.budgetFixed}, ${jobPostsTable.budgetMax}) ${dir} NULLS LAST`;
      break;
    case "deadline":
      orderBy = sql`${jobPostsTable.deadlineHours} ${dir} NULLS LAST`;
      break;
    case "proposals":
      orderBy = sql`${jobPostsTable.proposalsCount} ${dir}`;
      break;
    default:
      orderBy = sql`${jobPostsTable.createdAt} ${dir}`;
  }

  const limit = Math.min(filters.limit ?? 20, 100);
  const offset = filters.offset ?? 0;

  const [jobs, countResult] = await Promise.all([
    db
      .select()
      .from(jobPostsTable)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobPostsTable)
      .where(where),
  ]);

  return { jobs, total: countResult[0]?.count ?? 0 };
}

export async function getMyJobs(posterUserId: string): Promise<JobPost[]> {
  return db
    .select()
    .from(jobPostsTable)
    .where(eq(jobPostsTable.posterUserId, posterUserId))
    .orderBy(desc(jobPostsTable.createdAt));
}

export async function incrementProposalsCount(jobId: string): Promise<void> {
  await db
    .update(jobPostsTable)
    .set({
      proposalsCount: sql`${jobPostsTable.proposalsCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(jobPostsTable.id, jobId));
}

export async function expireJobs(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(jobPostsTable)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(jobPostsTable.status, "open"),
        lte(jobPostsTable.expiresAt, now),
      ),
    )
    .returning({ id: jobPostsTable.id, posterUserId: jobPostsTable.posterUserId, title: jobPostsTable.title });

  for (const job of result) {
    await logJobEvent(job.posterUserId, "job.expired", {
      jobId: job.id,
      title: job.title,
    });
  }

  return result.length;
}
