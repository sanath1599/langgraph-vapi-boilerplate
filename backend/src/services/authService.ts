import { PrismaClient } from "@prisma/client";
import { verifyPassword, signJwt, generateApiKey, hashApiKey } from "../utils/auth";
import { unauthorizedError, validationError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

export async function loginAdmin(username: string, password: string): Promise<{ token: string }> {
  if (!username?.trim() || !password) {
    throw validationError("username and password are required");
  }
  const admin = await prisma.adminUser.findUnique({
    where: { username: username.trim() },
  });
  if (!admin) {
    throw unauthorizedError("Invalid username or password");
  }
  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    throw unauthorizedError("Invalid username or password");
  }
  const token = signJwt({ sub: admin.id });
  return { token };
}

export async function listApiKeys() {
  return prisma.apiKey.findMany({
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: { id: "desc" },
  });
}

export async function createApiKey(name: string | null): Promise<{
  id: number;
  apiKey: string;
  name: string | null;
}> {
  const plainKey = generateApiKey();
  const keyHash = hashApiKey(plainKey);
  const created = await prisma.apiKey.create({
    data: { keyHash, name },
  });
  return {
    id: created.id,
    apiKey: plainKey,
    name: created.name,
  };
}
