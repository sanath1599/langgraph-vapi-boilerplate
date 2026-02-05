import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";
import { config } from "../config";

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "24h";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signJwt(payload: { sub: number }): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwt(token: string): { sub: number } {
  const decoded = jwt.verify(token, config.jwtSecret) as unknown;
  if (typeof decoded !== "object" || decoded == null || typeof (decoded as { sub?: number }).sub !== "number") {
    throw new Error("Invalid token payload");
  }
  return { sub: (decoded as { sub: number }).sub };
}

export function hashApiKey(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

export function generateApiKey(): string {
  const random = crypto.randomBytes(24).toString("base64url");
  return `sk-${random}`;
}
