import type { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import { AppError } from "./error-handler";

export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, "VALIDATION_ERROR", "Invalid request body", result.error.issues));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(new AppError(400, "VALIDATION_ERROR", "Invalid query parameters", result.error.issues));
    }
    (req as unknown as { query: z.output<T> }).query = result.data;
    next();
  };
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuidParam(...paramNames: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const name of paramNames) {
      const value = req.params[name] as string | undefined;
      if (value && !uuidRegex.test(value)) {
        return next(new AppError(400, "VALIDATION_ERROR", `Invalid UUID for parameter: ${name}`));
      }
    }
    next();
  };
}
