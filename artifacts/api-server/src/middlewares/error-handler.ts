import type { Request, Response, NextFunction } from "express";
import { logger } from "./request-logger";

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

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
      requestId,
    });
    return;
  }

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
