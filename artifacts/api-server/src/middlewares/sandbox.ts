/**
 * Sandbox mode middleware for Agent ID API.
 *
 * When a request includes `X-Sandbox: true` or uses an API key prefixed with
 * `agk_sandbox_`, the request is flagged as a sandbox request. Sandbox agents:
 * - Have handles prefixed with "sandbox-"
 * - Cannot interact with production agents (resolve, messaging, tasks)
 * - Are automatically purged by the expiry worker after 24 hours
 * - Have `isSandbox: true` in their metadata
 *
 * Sandbox API keys start with `agk_sandbox_`.
 */
import type { Request, Response, NextFunction } from "express";
import { AppError } from "./error-handler";

/**
 * Whether the SANDBOX_MODE environment variable is set to "enabled".
 * When enabled, ALL requests are treated as sandbox requests regardless
 * of headers or API keys.
 */
export function isSandboxEnvironment(): boolean {
  return process.env.SANDBOX_MODE === "enabled";
}

declare global {
  namespace Express {
    interface Request {
      isSandbox?: boolean;
    }
  }
}

export function sandboxMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (isSandboxEnvironment()) {
    req.isSandbox = true;
    next();
    return;
  }

  const sandboxHeader = req.headers["x-sandbox"];
  const agentKey = req.headers["x-agent-key"] as string | undefined;
  const apiKey = req.headers["x-api-key"] as string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  const isSandbox =
    sandboxHeader === "true" ||
    (agentKey !== undefined && agentKey.startsWith("agk_sandbox_")) ||
    (apiKey !== undefined && apiKey.startsWith("agk_sandbox_")) ||
    (bearerToken !== undefined && bearerToken.startsWith("agk_sandbox_"));

  req.isSandbox = isSandbox;
  next();
}

/**
 * Returns true if the given agent record (or metadata object) represents
 * a sandbox agent — i.e. it was created under a sandbox request.
 */
export function isAgentSandbox(
  agent: { handle?: string; metadata?: unknown } | null | undefined,
): boolean {
  if (!agent) return false;
  if (agent.handle && agent.handle.startsWith("sandbox-")) return true;
  const meta = agent.metadata as Record<string, unknown> | null | undefined;
  return meta?.isSandbox === true;
}

/**
 * Throws a 403 AppError if the request sandbox context mismatches the
 * target agent's sandbox status.
 *
 * Rules:
 * - Sandbox requests  → can only interact with sandbox agents
 * - Production requests → can only interact with production agents
 */
export function assertSandboxIsolation(
  req: Request,
  targetAgent: { handle?: string; metadata?: unknown } | null | undefined,
  label = "agent",
): void {
  const requestIsSandbox = req.isSandbox === true;
  const agentIsSandbox = isAgentSandbox(targetAgent);

  if (requestIsSandbox && !agentIsSandbox) {
    throw new AppError(
      403,
      "SANDBOX_ISOLATION",
      `Sandbox requests cannot interact with production ${label}s`,
    );
  }

  if (!requestIsSandbox && agentIsSandbox) {
    throw new AppError(
      403,
      "SANDBOX_ISOLATION",
      `Production requests cannot interact with sandbox ${label}s`,
    );
  }
}
