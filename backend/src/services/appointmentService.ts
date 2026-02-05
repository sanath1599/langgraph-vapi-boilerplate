import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import { endOfDayUTC } from "../utils/dateHelpers";
import { notFoundError, validationError } from "../middleware/errorHandler";
import type { z } from "zod";
import type {
  previewAppointmentSchema,
  createAppointmentSchema,
  rescheduleOptionsSchema,
  patchAppointmentSchema,
  cancelAppointmentSchema,
} from "../types/appointment";

const prisma = new PrismaClient();

function maybeRandomFail() {
  if (config.mock.randomFailPct > 0 && Math.random() * 100 < config.mock.randomFailPct) {
    throw new Error("Mock random failure");
  }
}

export async function preview(data: z.infer<typeof previewAppointmentSchema>) {
  const provider = await prisma.provider.findUnique({
    where: { id: data.providerId, active: true },
  });
  if (!provider) throw notFoundError("Provider not found");
  const desiredStart = new Date(data.desiredTime);
  const end = new Date(desiredStart.getTime() + 60 * 60 * 1000);
  const slot = await prisma.availabilitySlot.findFirst({
    where: {
      providerId: data.providerId,
      visitType: data.visitType,
      isBooked: false,
      start: { gte: desiredStart },
      end: { lte: end },
    },
    orderBy: { start: "asc" },
  });
  const adjustedSlot = slot
    ? { slotId: slot.id, providerId: slot.providerId, start: slot.start.toISOString(), end: slot.end.toISOString() }
    : null;
  return {
    adjustedSlot,
    conflicts: [] as { reason: string }[],
    copay: 25,
  };
}

type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export async function createAppointment(data: CreateAppointmentInput) {
  maybeRandomFail();
  let slotId = data.slotId;
  let start: Date;
  let end: Date;

  if (data.slotId) {
    const slot = await prisma.availabilitySlot.findFirst({
      where: { id: data.slotId, isBooked: false },
    });
    if (!slot) throw validationError("Slot not available or already booked");
    start = slot.start;
    end = slot.end;
  } else if (data.start && data.end) {
    start = new Date(data.start);
    end = new Date(data.end);
    const existing = await prisma.availabilitySlot.findFirst({
      where: {
        organizationId: data.organizationId,
        providerId: data.providerId,
        visitType: data.visitType,
        isBooked: false,
        start: { lte: start },
        end: { gte: end },
      },
    });
    if (existing) slotId = existing.id;
  } else {
    throw validationError("Provide either slotId or start+end");
  }

  const appointment = await prisma.appointment.create({
    data: {
      userId: data.userId,
      organizationId: data.organizationId,
      providerId: data.providerId,
      visitType: data.visitType,
      reason: data.reason ?? null,
      start,
      end,
      status: "booked",
      channel: data.channel ?? null,
    },
  });

  if (slotId) {
    await prisma.availabilitySlot.update({
      where: { id: slotId },
      data: { isBooked: true, appointmentId: appointment.id },
    });
  }

  return {
    appointmentId: appointment.id,
    start: appointment.start.toISOString(),
    end: appointment.end.toISOString(),
    status: appointment.status,
  };
}

export async function getAppointment(id: number) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, dob: true, email: true, memberId: true } },
      provider: { select: { id: true, name: true, specialty: true } },
      organization: { select: { id: true, name: true } },
    },
  });
  if (!appointment) throw notFoundError("Appointment not found");
  return {
    id: appointment.id,
    userId: appointment.userId,
    organizationId: appointment.organizationId,
    providerId: appointment.providerId,
    visitType: appointment.visitType,
    reason: appointment.reason,
    start: appointment.start.toISOString(),
    end: appointment.end.toISOString(),
    status: appointment.status,
    channel: appointment.channel,
    user: appointment.user,
    provider: appointment.provider,
    organization: appointment.organization,
  };
}

export async function listAppointments(params: {
  userId?: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
  providerId?: number;
}) {
  const where: Record<string, unknown> = {};
  if (params.userId != null) where.userId = params.userId;
  const status = params.status ?? "upcoming";
  if (status === "upcoming") {
    where.status = "booked";
    where.start = { gte: new Date() };
  } else if (status != null) {
    where.status = status;
  }
  if (params.providerId != null) where.providerId = params.providerId;
  if (params.fromDate || params.toDate) {
    const range: Record<string, Date> = {};
    if (params.fromDate) range.gte = new Date(params.fromDate);
    if (params.toDate) range.lte = new Date(params.toDate);
    if (Object.keys(range).length) {
      const merged = typeof where.start === "object" && where.start && "gte" in (where.start as object)
        ? { ...(where.start as Record<string, Date>), ...range }
        : range;
      if (status === "upcoming" && merged.gte && merged.gte.getTime() < Date.now()) {
        merged.gte = new Date();
      }
      where.start = merged;
    }
  }
  const list = await prisma.appointment.findMany({
    where: where as never,
    include: {
      provider: { select: { name: true } },
      organization: { select: { name: true } },
    },
    orderBy: { start: "asc" },
    take: 100,
  });
  return list.map((a) => ({
    id: a.id,
    providerName: a.provider.name,
    organizationName: a.organization.name,
    start: a.start.toISOString(),
    end: a.end.toISOString(),
    visitType: a.visitType,
    status: a.status,
  }));
}

export type ListAppointmentsForAdminParams = {
  fromDate: string;
  toDate: string;
  userId?: number;
};

/** Admin: list appointments in date range with full user/org/provider names. */
export async function listAppointmentsForAdmin(params: ListAppointmentsForAdminParams) {
  const startGte = new Date(params.fromDate);
  startGte.setUTCHours(0, 0, 0, 0);
  const startLte = endOfDayUTC(new Date(params.toDate));

  const where: { start: { gte: Date; lte: Date }; userId?: number } = {
    start: { gte: startGte, lte: startLte },
  };
  if (params.userId != null) where.userId = params.userId;

  const list = await prisma.appointment.findMany({
    where,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      provider: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
    },
    orderBy: { start: "asc" },
    take: 200,
  });

  return list.map((a) => ({
    id: a.id,
    userId: a.userId,
    userName: `${a.user.firstName} ${a.user.lastName}`.trim(),
    userEmail: a.user.email,
    userPhone: a.user.phone,
    organizationId: a.organizationId,
    organizationName: a.organization.name,
    providerId: a.providerId,
    providerName: a.provider.name,
    visitType: a.visitType,
    reason: a.reason,
    start: a.start.toISOString(),
    end: a.end.toISOString(),
    status: a.status,
    channel: a.channel,
  }));
}

export async function rescheduleOptions(
  appointmentId: number,
  data: z.infer<typeof rescheduleOptionsSchema>
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appointment) throw notFoundError("Appointment not found");

  const where: Record<string, unknown> = {
    organizationId: appointment.organizationId,
    visitType: appointment.visitType,
    isBooked: false,
    start: { gte: new Date() },
  };
  if (data.providerPreference != null) {
    where.providerId = data.providerPreference;
  } else {
    where.providerId = appointment.providerId;
  }
  const now = new Date();
  const startRange: { gte?: Date; lte?: Date } = { gte: now };
  if (data.preferredDateRange?.from) startRange.gte = new Date(data.preferredDateRange.from);
  if (data.preferredDateRange?.to) startRange.lte = new Date(data.preferredDateRange.to);
  if (startRange.gte!.getTime() < now.getTime()) startRange.gte = now;
  where.start = startRange;
  const slots = await prisma.availabilitySlot.findMany({
    where: where as never,
    orderBy: { start: "asc" },
    take: 20,
  });
  let filtered = slots;
  if (data.timeOfDay) {
    const hourRanges: Record<string, [number, number]> = {
      morning: [6, 12],
      afternoon: [12, 17],
      evening: [17, 24],
    };
    const [minH, maxH] = hourRanges[data.timeOfDay] ?? [0, 24];
    filtered = slots.filter((s) => {
      const h = s.start.getHours();
      return h >= minH && h < maxH;
    });
  }
  return {
    slots: filtered.slice(0, 10).map((s) => ({
      slotId: s.id,
      providerId: s.providerId,
      start: s.start.toISOString(),
      end: s.end.toISOString(),
    })),
  };
}

export async function patchAppointment(id: number, data: z.infer<typeof patchAppointmentSchema>) {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw notFoundError("Appointment not found");

  let newStart = appointment.start;
  let newEnd = appointment.end;
  let newSlotId: number | null = null;

  if (data.newSlotId) {
    const slot = await prisma.availabilitySlot.findFirst({
      where: { id: data.newSlotId, isBooked: false },
    });
    if (!slot) throw validationError("Slot not available");
    newStart = slot.start;
    newEnd = slot.end;
    newSlotId = data.newSlotId;
  } else if (data.newStart && data.newEnd) {
    newStart = new Date(data.newStart);
    newEnd = new Date(data.newEnd);
  }

  await prisma.availabilitySlot.updateMany({
    where: { appointmentId: id },
    data: { isBooked: false, appointmentId: null },
  });

  await prisma.appointment.update({
    where: { id },
    data: { start: newStart, end: newEnd },
  });

  if (newSlotId) {
    await prisma.availabilitySlot.update({
      where: { id: newSlotId },
      data: { isBooked: true, appointmentId: id },
    });
  }

  return getAppointment(id);
}

export async function cancelAppointment(id: number, data: z.infer<typeof cancelAppointmentSchema>) {
  if (!data.confirmed) throw validationError("Cancellation must be confirmed");
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw notFoundError("Appointment not found");

  await prisma.availabilitySlot.updateMany({
    where: { appointmentId: id },
    data: { isBooked: false, appointmentId: null },
  });

  await prisma.appointment.update({
    where: { id },
    data: { status: "cancelled" },
  });

  return { status: "cancelled" as const, penalty: null };
}

export async function cancelOptions(userId: number) {
  const list = await prisma.appointment.findMany({
    where: { userId, status: "booked", start: { gte: new Date() } },
    include: {
      provider: { select: { name: true } },
      organization: { select: { name: true } },
    },
    orderBy: { start: "asc" },
  });
  return list.map((a) => ({
    id: a.id,
    providerName: a.provider.name,
    organizationName: a.organization.name,
    start: a.start.toISOString(),
    end: a.end.toISOString(),
    visitType: a.visitType,
  }));
}
