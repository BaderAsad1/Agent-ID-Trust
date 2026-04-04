/**
 * Test Express app factory.
 *
 * Creates a minimal Express app with the real middleware stack but mocked
 * external services (Stripe, Resend, Redis, etc.). No running localhost server
 * is required — use supertest's in-process mode.
 *
 * Usage:
 *   import { buildTestApp } from '../test-support/app';
 *   const app = buildTestApp();
 *   const res = await request(app).post('/api/v1/admin/agents/123/revoke')...
 */
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { errorHandler } from "../middlewares/error-handler";
import { requestIdMiddleware } from "../middlewares/request-id";

/**
 * Build a minimal test Express app with the real error handler and router.
 *
 * External mocks (Stripe, email, Redis, etc.) must be configured via vi.mock()
 * at the top of each test file BEFORE importing this factory.
 */
export function buildTestApp(): Express {
  const app = express();

  app.set("trust proxy", 1);
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  return app;
}

/**
 * Build an admin test app with the admin router mounted.
 */
export async function buildAdminTestApp(): Promise<Express> {
  const app = buildTestApp();

  const { default: adminRouter } = await import("../routes/v1/admin");
  app.use("/api/v1/admin", adminRouter);
  app.use(errorHandler);

  return app;
}

/**
 * Build a test app with the agent-auth routes mounted (challenge + session).
 */
export async function buildAgentAuthTestApp(): Promise<Express> {
  const app = buildTestApp();

  const { default: agentAuthRouter } = await import("../routes/v1/agent-auth");
  app.use("/api/v1/auth", agentAuthRouter);
  app.use(errorHandler);

  return app;
}

/**
 * Build a test app with a protected route that requires agent auth.
 * The route returns { agentId, strategy } on success.
 */
export async function buildAgentAuthProtectedApp(): Promise<Express> {
  const app = buildTestApp();

  const { requireAgentAuth } = await import("../middlewares/agent-auth");

  app.get(
    "/api/v1/protected",
    requireAgentAuth,
    (req, res) => {
      res.json({
        agentId: req.authenticatedAgent?.id,
        strategy: req.agentAuthStrategy,
        trustTier: req.agentTrustContext?.trustTier,
      });
    },
  );

  app.use(errorHandler);

  return app;
}

/**
 * Build a test app with the programmatic registration router.
 */
export async function buildProgrammaticTestApp(): Promise<Express> {
  const app = buildTestApp();

  const { default: programmaticRouter } = await import("../routes/v1/programmatic");
  app.use("/api/v1", programmaticRouter);
  app.use(errorHandler);

  return app;
}
