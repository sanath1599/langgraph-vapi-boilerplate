import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger";

export const VALIDATION_CODE = "VALIDATION";
export const NOT_FOUND_CODE = "NOT_FOUND";
export const UNAUTHORIZED_CODE = "UNAUTHORIZED";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function validationError(message: string, details?: unknown): AppError {
  return new AppError(400, VALIDATION_CODE, message, details);
}

export function notFoundError(message: string): AppError {
  return new AppError(404, NOT_FOUND_CODE, message);
}

export function unauthorizedError(message: string = "Unauthorized"): AppError {
  return new AppError(401, UNAUTHORIZED_CODE, message);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error(err.message, { code: err.code, details: err.details });
    else logger.warn(err.message, { code: err.code, statusCode: err.statusCode });
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details != null && { details: err.details }),
    });
    return;
  }
  if (err instanceof Error) {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: "INTERNAL", message: err.message });
    return;
  }
  logger.error("Unknown error");
  res.status(500).json({ error: "INTERNAL", message: "Unknown error" });
}

/**
 * Wrap async route handlers so thrown errors and rejected promises are passed to next(err).
 * Use when express-async-errors is not available.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
