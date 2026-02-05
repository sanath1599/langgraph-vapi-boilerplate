import { PrismaClient } from "@prisma/client";
import { notFoundError, validationError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

export type BookingRules = {
  acceptingBookings: boolean;
  minDaysInAdvance: number;
  maxDaysInAdvance: number;
  workingHours: Record<string, { start: string; end: string }>;
  allowedVisitTypes: string[];
};

export async function getBookingRules(organizationId: number): Promise<BookingRules> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      acceptingBookings: true,
      minDaysInAdvance: true,
      maxDaysInAdvance: true,
      workingHours: true,
      allowedVisitTypes: true,
    },
  });
  if (!organization) throw notFoundError("Organization not found");
  const workingHours =
    typeof organization.workingHours === "string"
      ? JSON.parse(organization.workingHours)
      : organization.workingHours;
  const allowedVisitTypes =
    typeof organization.allowedVisitTypes === "string"
      ? JSON.parse(organization.allowedVisitTypes)
      : organization.allowedVisitTypes;
  return {
    acceptingBookings: organization.acceptingBookings,
    minDaysInAdvance: organization.minDaysInAdvance,
    maxDaysInAdvance: organization.maxDaysInAdvance,
    workingHours,
    allowedVisitTypes,
  };
}

export async function listOrganizations() {
  return prisma.organization.findMany({
    orderBy: { id: "asc" },
  });
}

const DEFAULT_WORKING_HOURS = {
  mon: { start: "09:00", end: "17:00" },
  tue: { start: "09:00", end: "17:00" },
  wed: { start: "09:00", end: "17:00" },
  thu: { start: "09:00", end: "17:00" },
  fri: { start: "09:00", end: "17:00" },
};

const DEFAULT_ALLOWED_VISIT_TYPES = ["new_visit", "follow_up", "consultation"];

export async function createOrganization(data: {
  name: string;
  timezone?: string;
  acceptingBookings?: boolean;
  minDaysInAdvance?: number;
  maxDaysInAdvance?: number;
  workingHours?: string | object;
  allowedVisitTypes?: string | string[];
}) {
  if (!data.name?.trim()) throw validationError("name is required");
  const workingHours =
    typeof data.workingHours === "string"
      ? data.workingHours
      : JSON.stringify(data.workingHours ?? DEFAULT_WORKING_HOURS);
  const allowedVisitTypes = Array.isArray(data.allowedVisitTypes)
    ? JSON.stringify(data.allowedVisitTypes)
    : typeof data.allowedVisitTypes === "string"
      ? data.allowedVisitTypes
      : JSON.stringify(DEFAULT_ALLOWED_VISIT_TYPES);
  return prisma.organization.create({
    data: {
      name: data.name.trim(),
      timezone: (data.timezone ?? "America/New_York").trim(),
      acceptingBookings: data.acceptingBookings !== false,
      minDaysInAdvance: typeof data.minDaysInAdvance === "number" ? data.minDaysInAdvance : 0,
      maxDaysInAdvance: typeof data.maxDaysInAdvance === "number" ? data.maxDaysInAdvance : 90,
      workingHours,
      allowedVisitTypes,
    },
  });
}

export async function patchOrganization(
  id: number,
  data: {
    name?: string;
    timezone?: string;
    acceptingBookings?: boolean;
    minDaysInAdvance?: number;
    maxDaysInAdvance?: number;
    workingHours?: string | object;
    allowedVisitTypes?: string | string[];
  }
) {
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) throw notFoundError("Organization not found");

  const update: Record<string, unknown> = {};
  if (typeof data.name === "string" && data.name.trim()) update.name = data.name.trim();
  if (typeof data.timezone === "string") update.timezone = data.timezone.trim();
  if (typeof data.acceptingBookings === "boolean") update.acceptingBookings = data.acceptingBookings;
  if (typeof data.minDaysInAdvance === "number") update.minDaysInAdvance = data.minDaysInAdvance;
  if (typeof data.maxDaysInAdvance === "number") update.maxDaysInAdvance = data.maxDaysInAdvance;
  if (data.workingHours != null) {
    update.workingHours =
      typeof data.workingHours === "string"
        ? data.workingHours
        : JSON.stringify(data.workingHours);
  }
  if (data.allowedVisitTypes != null) {
    update.allowedVisitTypes = Array.isArray(data.allowedVisitTypes)
      ? JSON.stringify(data.allowedVisitTypes)
      : typeof data.allowedVisitTypes === "string"
        ? data.allowedVisitTypes
        : existing.allowedVisitTypes;
  }

  return prisma.organization.update({
    where: { id },
    data: update as never,
  });
}
