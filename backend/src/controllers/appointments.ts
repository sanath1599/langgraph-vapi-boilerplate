import type { Request, Response } from "express";
import {
  previewAppointmentSchema,
  createAppointmentSchema,
  rescheduleOptionsSchema,
  patchAppointmentSchema,
  cancelAppointmentSchema,
  cancelOptionsSchema,
} from "../types/appointment";
import { validationError } from "../middleware/errorHandler";
import * as appointmentService from "../services/appointmentService";

export async function preview(req: Request, res: Response): Promise<void> {
  const parsed = previewAppointmentSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const result = await appointmentService.preview(parsed.data);
  res.json(result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const { slotId, start, end, ...rest } = parsed.data;
  const result = await appointmentService.createAppointment({
    ...rest,
    slotId: slotId ?? undefined,
    start: start ?? undefined,
    end: end ?? undefined,
  });
  res.status(201).json(result);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.appointmentId, 10);
  if (Number.isNaN(id)) throw validationError("Invalid appointmentId");
  const result = await appointmentService.getAppointment(id);
  res.json(result);
}

/** POST version: same as GET /:appointmentId but accepts body { appointmentId }. */
export async function getByIdPost(req: Request, res: Response): Promise<void> {
  const raw = req.body?.appointmentId;
  const id = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(id)) throw validationError("Invalid or missing body: appointmentId");
  const result = await appointmentService.getAppointment(id);
  res.json(result);
}

export async function list(req: Request, res: Response): Promise<void> {
  const userId = req.query.userId != null ? parseInt(String(req.query.userId), 10) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : "upcoming";
  const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
  const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;
  const providerId = req.query.providerId != null ? parseInt(String(req.query.providerId), 10) : undefined;
  const result = await appointmentService.listAppointments({ userId, status, fromDate, toDate, providerId });
  res.json(result);
}

/** POST version: same as GET / but accepts body { userId?, status?, fromDate?, toDate?, providerId? }. */
export async function listPost(req: Request, res: Response): Promise<void> {
  const body = req.body ?? {};
  const userId = body.userId != null ? parseInt(String(body.userId), 10) : undefined;
  const status = typeof body.status === "string" ? body.status : "upcoming";
  const fromDate = typeof body.fromDate === "string" ? body.fromDate : undefined;
  const toDate = typeof body.toDate === "string" ? body.toDate : undefined;
  const providerId = body.providerId != null ? parseInt(String(body.providerId), 10) : undefined;
  const result = await appointmentService.listAppointments({ userId, status, fromDate, toDate, providerId });
  res.json(result);
}

export async function rescheduleOptions(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.appointmentId, 10);
  if (Number.isNaN(id)) throw validationError("Invalid appointmentId");
  const parsed = rescheduleOptionsSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const result = await appointmentService.rescheduleOptions(id, parsed.data);
  res.json(result);
}

export async function patch(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.appointmentId, 10);
  if (Number.isNaN(id)) throw validationError("Invalid appointmentId");
  const parsed = patchAppointmentSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const result = await appointmentService.patchAppointment(id, parsed.data);
  res.json(result);
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.appointmentId, 10);
  if (Number.isNaN(id)) throw validationError("Invalid appointmentId");
  const parsed = cancelAppointmentSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const result = await appointmentService.cancelAppointment(id, parsed.data);
  res.json(result);
}

export async function cancelOptions(req: Request, res: Response): Promise<void> {
  const parsed = cancelOptionsSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const result = await appointmentService.cancelOptions(parsed.data.userId);
  res.json(result);
}
