/**
 * Mail gating — route-level rejection tests
 *
 * Verifies that GET /agents/:id/inbox returns HTTP 402 PLAN_REQUIRED
 * when the agent's plan is 'free' or 'none', and HTTP 200 for paid plans.
 *
 * Mocks: DB (@workspace/db), auth middleware, mail service, and activity logger.
 * The real mail route handler is exercised end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import { errorHandler } from '../middlewares/error-handler';

// ── Mocks (hoisted by vitest) ─────────────────────────────────────────────────

vi.mock('@workspace/db', () => ({
  db: {},
  usersTable: {},
  agentsTable: {},
  inboxesTable: {},
  messagesTable: {},
  auditEventsTable: {},
  subscriptionsTable: {},
}));

vi.mock('../services/activity-logger', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/mail-transport', () => ({
  checkOutboundRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

const mockGetAgentPlan = vi.fn();
const mockGetPlanLimits = vi.fn();

vi.mock('../services/billing', () => ({
  getAgentPlan: mockGetAgentPlan,
  getPlanLimits: mockGetPlanLimits,
}));

const mockVerifyAgentOwnership = vi.fn();
const mockGetOrCreateInbox = vi.fn();
const mockGetInboxStats = vi.fn();

vi.mock('../services/mail', () => ({
  verifyAgentOwnership: mockVerifyAgentOwnership,
  getOrCreateInbox: mockGetOrCreateInbox,
  getInboxStats: mockGetInboxStats,
  getInboxByAgent: vi.fn(),
}));

vi.mock('../middlewares/replit-auth', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId?: string }).userId = 'user-test-1';
    next();
  },
}));

vi.mock('../middlewares/agent-auth', () => ({
  requireAgentAuth: (_req: unknown, _res: unknown, next: (e?: unknown) => void) => next(),
}));

vi.mock('../middlewares/sandbox', () => ({
  assertSandboxIsolation: (_req: unknown, _res: unknown, next: (e?: unknown) => void) => next(),
  isAgentSandbox: () => false,
}));

// ── Test app builder ──────────────────────────────────────────────────────────

async function buildMailApp() {
  const app = express();
  app.use(express.json());
  const { default: mailRouter } = await import('../routes/v1/mail');
  app.use('/', mailRouter);
  app.use(errorHandler);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Mail route — Free-plan gating (GET /agents/:id/inbox)', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyAgentOwnership.mockResolvedValue(true);
    mockGetOrCreateInbox.mockResolvedValue({ id: 'inbox-1', agentId: 'agent-1' });
    mockGetInboxStats.mockResolvedValue({ total: 0, unread: 0 });
    app = await buildMailApp();
  });

  it('returns 402 PLAN_REQUIRED when agent plan is "free"', async () => {
    mockGetAgentPlan.mockResolvedValue('free');
    mockGetPlanLimits.mockReturnValue({ canReceiveMail: false });

    const res = await request(app).get('/agents/agent-1/inbox');
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('PLAN_REQUIRED');
  });

  it('returns 402 PLAN_REQUIRED when agent plan is "none"', async () => {
    mockGetAgentPlan.mockResolvedValue('none');
    mockGetPlanLimits.mockReturnValue({ canReceiveMail: false });

    const res = await request(app).get('/agents/agent-1/inbox');
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('PLAN_REQUIRED');
  });

  it('returns 200 when agent plan is "starter" (canReceiveMail=true)', async () => {
    mockGetAgentPlan.mockResolvedValue('starter');
    mockGetPlanLimits.mockReturnValue({ canReceiveMail: true });

    const res = await request(app).get('/agents/agent-1/inbox');
    expect(res.status).toBe(200);
    expect(res.body.inbox).toBeDefined();
  });

  it('returns 200 when agent plan is "pro" (canReceiveMail=true)', async () => {
    mockGetAgentPlan.mockResolvedValue('pro');
    mockGetPlanLimits.mockReturnValue({ canReceiveMail: true });

    const res = await request(app).get('/agents/agent-1/inbox');
    expect(res.status).toBe(200);
  });
});
