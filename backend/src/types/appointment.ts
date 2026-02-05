import { z } from "zod";

export const previewAppointmentSchema = z.object({
  userId: z.number().int().positive(),
  providerId: z.number().int().positive(),
  visitType: z.string().min(1),
  desiredTime: z.string().datetime(),
});

export const createAppointmentSchema = z.object({
  userId: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  providerId: z.number().int().positive(),
  slotId: z.number().int().positive().optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  visitType: z.string().min(1),
  reason: z.string().optional(),
  channel: z.string().optional(),
}).refine(
  (data) => data.slotId != null || (data.start != null && data.end != null),
  { message: "Provide either slotId or start+end" }
);

export const rescheduleOptionsSchema = z.object({
  preferredDateRange: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
  timeOfDay: z.enum(["morning", "afternoon", "evening"]).optional(),
  providerPreference: z.number().int().positive().optional(),
});

export const patchAppointmentSchema = z.object({
  newSlotId: z.number().int().positive().optional(),
  newStart: z.string().datetime().optional(),
  newEnd: z.string().datetime().optional(),
  reason: z.string().optional(),
  updatedMetadata: z.record(z.unknown()).optional(),
});

export const cancelAppointmentSchema = z.object({
  confirmed: z.boolean(),
  cancellationReason: z.string().optional(),
});

export const cancelOptionsSchema = z.object({
  userId: z.number().int().positive(),
});
