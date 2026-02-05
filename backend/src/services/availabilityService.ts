import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import { matchesTimeOfDay, parseDateOnly, endOfDayUTC, resolveWhenToDateRange } from "../utils/dateHelpers";
import type { TimeOfDay } from "../utils/dateHelpers";
import { validationError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

export type AvailabilityParams = {
  organizationId: number | undefined;
  providerId: number | undefined;
  visitType: string | undefined;
  when: string | undefined;
  fromDate: string | undefined;
  toDate: string | undefined;
  preferredTimeOfDay: TimeOfDay | undefined;
};

export type AvailabilitySlotResult = {
  slotId: number;
  providerId: number;
  start: string;
  end: string;
};

export async function listAvailability(
  params: AvailabilityParams
): Promise<AvailabilitySlotResult[]> {
  const {
    organizationId,
    providerId,
    visitType,
    when: whenParam,
    fromDate: fromDateParam,
    toDate: toDateParam,
    preferredTimeOfDay,
  } = params;

  if (organizationId == null || Number.isNaN(organizationId)) {
    throw validationError("organizationId is required");
  }

  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  if (whenParam) {
    const range = resolveWhenToDateRange(whenParam);
    if (!range) {
      throw validationError(
        "when must be 'this_week', 'next_week', or a single date in YYYY-MM-DD format"
      );
    }
    fromDate = range.fromDate;
    toDate = range.toDate;
  } else if (fromDateParam && toDateParam) {
    const from = parseDateOnly(fromDateParam);
    const to = parseDateOnly(toDateParam);
    if (!from || !to) {
      throw validationError(
        "fromDate and toDate must be valid dates (YYYY-MM-DD only, no time)"
      );
    }
    fromDate = from;
    toDate = endOfDayUTC(to);
  }

  const where: Record<string, unknown> = {
    organizationId,
    isBooked: false,
  };
  if (providerId != null && !Number.isNaN(providerId)) where.providerId = providerId;
  if (visitType) where.visitType = visitType;

  const startRange: Record<string, Date> = {};
  if (fromDate) startRange.gte = fromDate;
  if (toDate) startRange.lte = toDate;
  if (Object.keys(startRange).length) where.start = startRange;

  let slots = await prisma.availabilitySlot.findMany({
    where: where as never,
    orderBy: { start: "asc" },
  });

  if (config.mock.noBookingsFriday) {
    slots = slots.filter((s) => new Date(s.start).getDay() !== 5);
  }
  if (preferredTimeOfDay) {
    slots = slots.filter((s) =>
      matchesTimeOfDay(new Date(s.start), preferredTimeOfDay)
    );
  }

  return slots.map((s) => ({
    slotId: s.id,
    providerId: s.providerId,
    start: s.start.toISOString(),
    end: s.end.toISOString(),
  }));
}
