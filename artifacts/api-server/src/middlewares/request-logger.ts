import type { Request, Response, NextFunction } from "express";

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    const log = `${level.toUpperCase()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    if (level === "error") {
      console.error(log);
    } else {
      console.log(log);
    }
  });

  next();
}
