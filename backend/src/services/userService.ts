import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import { normalizePhone } from "../utils/phone";
import { notFoundError } from "../middleware/errorHandler";
import type { CreateUserInput, PatchUserInput } from "../types/user";

const prisma = new PrismaClient();

function toApiUser(p: {
  id: number;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  email: string | null;
  phone: string | null;
  status: string;
  memberId: string;
  externalId: string | null;
  meta?: { notes: string | null; flags: string | null } | null;
}) {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    dob: p.dob,
    gender: p.gender,
    status: p.status,
    email: p.email ?? undefined,
    phone: p.phone ?? undefined,
    identifiers: { memberId: p.memberId, externalId: p.externalId ?? undefined },
    notes: p.meta?.notes ?? null,
    flags: p.meta?.flags ?? null,
  };
}

function toApiUserListItem(p: {
  id: number;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  status: string;
  phone: string | null;
}) {
  return {
    id: p.id,
    name: { firstName: p.firstName, lastName: p.lastName },
    dob: p.dob,
    gender: p.gender,
    status: p.status,
    phone: p.phone ?? undefined,
  };
}

export async function findByPhone(phone: string) {
  const normalized = normalizePhone(phone, config.defaultCountry).normalizedNumber;
  const list = await prisma.user.findMany({
    where: { phone: normalized },
  });
  return list.map(toApiUserListItem);
}

export async function getOrThrow(id: number) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { meta: true },
  });
  if (!user) throw notFoundError("User not found");
  return toApiUser(user);
}

/** Admin: list all users with fields needed for admin UI (no meta). */
export async function listUsersForAdmin() {
  const list = await prisma.user.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      memberId: true,
      status: true,
      dob: true,
      gender: true,
      createdAt: true,
    },
    orderBy: { id: "asc" },
  });
  return list;
}

export async function search(params: {
  name?: string;
  dob?: string;
  phone?: string;
  email?: string;
  memberId?: string;
  fuzzy?: string;
}) {
  const where: Record<string, unknown> = {};
  if (params.dob) where.dob = params.dob;
  if (params.email) where.email = params.email;
  if (params.memberId) where.memberId = params.memberId;
  if (params.phone) {
    const normalized = normalizePhone(params.phone, config.defaultCountry).normalizedNumber;
    where.phone = normalized;
  }
  if (params.name || params.fuzzy) {
    const term = (params.name || params.fuzzy || "").trim().toLowerCase();
    if (term) {
      where.OR = [
        { firstName: { contains: term } },
        { lastName: { contains: term } },
        { firstName: { contains: term }, lastName: { contains: term } },
      ];
    }
  }
  const list = await prisma.user.findMany({
    where: where as never,
    take: 50,
  });
  return list.map(toApiUserListItem);
}

function generateMemberId(): string {
  return "MEMBER-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 8);
}

export async function createUser(data: CreateUserInput) {
  const memberId = generateMemberId();
  const normalized = normalizePhone(data.phone, config.defaultCountry).normalizedNumber;
  const user = await prisma.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      dob: data.dob,
      gender: data.gender,
      status: "active",
      memberId,
      email: data.email || null,
      phone: normalized,
      externalId: data.externalId || null,
    },
  });
  if (data.address || data.insurance || data.chronicConditions || data.allergies) {
    await prisma.userMeta.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        insurance: data.insurance ?? null,
        chronicConditions: data.chronicConditions ?? null,
        allergies: data.allergies ?? null,
      },
      update: {
        insurance: data.insurance ?? undefined,
        chronicConditions: data.chronicConditions ?? undefined,
        allergies: data.allergies ?? undefined,
      },
    });
  }
  return {
    userId: user.id,
    memberId: user.memberId,
    createdAt: user.createdAt.toISOString(),
  };
}

const REQUIRED_FIELDS = ["firstName", "lastName", "dob", "gender", "phone"] as const;

export async function validateRegistration(data: CreateUserInput) {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  for (const key of REQUIRED_FIELDS) {
    const val = data[key];
    if (val == null || (typeof val === "string" && !val.trim())) missingFields.push(key);
  }
  if (data.email && data.email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    invalidFields.push("email");
  }
  return {
    valid: missingFields.length === 0 && invalidFields.length === 0,
    missingFields,
    invalidFields,
  };
}

export async function patchUser(id: number, data: PatchUserInput) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { meta: true },
  });
  if (!user) throw notFoundError("User not found");

  const updatePayload: Record<string, unknown> = {};
  if (data.firstName != null) updatePayload.firstName = data.firstName;
  if (data.lastName != null) updatePayload.lastName = data.lastName;
  if (data.dob != null) updatePayload.dob = data.dob;
  if (data.gender != null) updatePayload.gender = data.gender;
  if (data.email !== undefined) updatePayload.email = data.email || null;
  if (data.status != null) updatePayload.status = data.status;
  if (data.phone != null && data.phone.trim() !== "") {
    updatePayload.phone = normalizePhone(data.phone, config.defaultCountry).normalizedNumber;
  }

  await prisma.user.update({
    where: { id },
    data: updatePayload as never,
  });

  const updated = await prisma.user.findUnique({
    where: { id },
    include: { meta: true },
  });
  if (!updated) throw notFoundError("User not found");
  return toApiUser(updated);
}
