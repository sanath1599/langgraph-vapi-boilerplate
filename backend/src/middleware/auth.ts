import type { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { unauthorizedError } from "./errorHandler";
import { verifyJwt } from "../utils/auth";
import { hashApiKey } from "../utils/auth";
import { config } from "../config";

const prisma = new PrismaClient();

export interface AdminUserPayload {
  id: number;
  username: string;
}

export interface ApiKeyPayload {
  id: number;
  name: string | null;
}

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminUserPayload;
      apiKey?: ApiKeyPayload;
    }
  }
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (!token) {
    throw unauthorizedError("Missing or invalid Authorization header");
  }
  try {
    const decoded = verifyJwt(token);
    req.adminUser = { id: decoded.sub, username: "" };
    next();
  } catch {
    throw unauthorizedError("Invalid or expired token");
  }
}

export async function requireApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!config.requireApiKey) {
    next();
    return;
  }
  const rawKey =
    req.headers["x-api-key"] as string | undefined ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);
  if (!rawKey) {
    throw unauthorizedError("Missing x-api-key or Authorization header");
  }
  const keyHash = hashApiKey(rawKey);
  const key = await prisma.apiKey.findUnique({
    where: { keyHash },
  });
  if (!key) {
    throw unauthorizedError("Invalid API key");
  }
  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });
  req.apiKey = { id: key.id, name: key.name };
  next();
}
