import type { Request, Response, NextFunction } from "express";
import { logger } from "./request-logger";
import { RateLimitError } from "../services/mail-rate-limit";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const requestId = req.requestId ?? "unknown";

  if (err instanceof RateLimitError) {
    res.setHeader("Retry-After", String(err.retryAfterSeconds));
    res.status(429).json({
      error: err.code,
      message: err.message,
      details: {
        limit: err.limit,
        current: err.current,
        bucket: err.bucket,
        retryAfterSeconds: err.retryAfterSeconds,
      },
      requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    // AppError(429, "RATE_LIMIT_EXCEEDED", ...) emitted by route-level checks
    // gets the same Retry-After treatment so clients can back off uniformly.
    if (err.statusCode === 429) {
      const retryAfter =
        (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 3600;
      res.setHeader("Retry-After", String(retryAfter));
    }
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
      requestId,
    });
    return;
  }

  // Always log the full error server-side (stack, request context).
  // Never return stack traces to clients — they leak DB schema, file paths, and code structure.
  logger.error(
    { err, requestId, method: req.method, path: req.path },
    "Unhandled error",
  );

  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: "Internal server error",
    requestId,
  });
}
