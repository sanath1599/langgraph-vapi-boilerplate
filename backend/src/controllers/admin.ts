import type { Request, Response } from "express";
import { validationError } from "../middleware/errorHandler";
import { parseDateOnly, defaultFromTo } from "../utils/dateHelpers";
import { createUserSchema, patchUserSchema } from "../types/user";
import { createAppointmentSchema, patchAppointmentSchema } from "../types/appointment";
import * as authService from "../services/authService";
import * as userService from "../services/userService";
import * as appointmentService from "../services/appointmentService";
import * as organizationService from "../services/organizationService";
import * as providerService from "../services/providerService";
import * as availabilityService from "../services/availabilityService";

export async function login(req: Request, res: Response): Promise<void> {
  const username =
    typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const result = await authService.loginAdmin(username, password);
  res.json(result);
}

export async function getUsers(_req: Request, res: Response): Promise<void> {
  const users = await userService.listUsersForAdmin();
  res.json(users);
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const result = await userService.createUser(parsed.data);
  res.status(201).json(result);
}

export async function patchUser(req: Request, res: Response): Promise<void> {
  const userId = parseInt(req.params.userId, 10);
  if (Number.isNaN(userId)) throw validationError("Invalid userId");
  const parsed = patchUserSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const updated = await userService.patchUser(userId, parsed.data);
  res.json(updated);
}

export async function getOrganizations(_req: Request, res: Response): Promise<void> {
  const orgs = await organizationService.listOrganizations();
  res.json(orgs);
}

export async function createOrganization(req: Request, res: Response): Promise<void> {
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "America/New_York";
  const workingHours =
    typeof body.workingHours === "string"
      ? body.workingHours
      : JSON.stringify(body.workingHours ?? { mon: { start: "09:00", end: "17:00" }, tue: { start: "09:00", end: "17:00" }, wed: { start: "09:00", end: "17:00" }, thu: { start: "09:00", end: "17:00" }, fri: { start: "09:00", end: "17:00" } });
  const allowedVisitTypes =
    typeof body.allowedVisitTypes === "string"
      ? body.allowedVisitTypes
      : JSON.stringify(Array.isArray(body.allowedVisitTypes) ? body.allowedVisitTypes : ["new_visit", "follow_up", "consultation"]);
  const acceptingBookings = body.acceptingBookings !== false;
  const minDaysInAdvance = typeof body.minDaysInAdvance === "number" ? body.minDaysInAdvance : 0;
  const maxDaysInAdvance = typeof body.maxDaysInAdvance === "number" ? body.maxDaysInAdvance : 90;
  const org = await organizationService.createOrganization({
    name,
    timezone,
    acceptingBookings,
    minDaysInAdvance,
    maxDaysInAdvance,
    workingHours,
    allowedVisitTypes,
  });
  res.status(201).json(org);
}

export async function patchOrganization(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw validationError("Invalid organization id");
  const body = req.body ?? {};
  const data: Parameters<typeof organizationService.patchOrganization>[1] = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.timezone === "string") data.timezone = body.timezone.trim();
  if (typeof body.acceptingBookings === "boolean") data.acceptingBookings = body.acceptingBookings;
  if (typeof body.minDaysInAdvance === "number") data.minDaysInAdvance = body.minDaysInAdvance;
  if (typeof body.maxDaysInAdvance === "number") data.maxDaysInAdvance = body.maxDaysInAdvance;
  if (body.workingHours != null) {
    data.workingHours = typeof body.workingHours === "string" ? body.workingHours : body.workingHours;
  }
  if (body.allowedVisitTypes != null) {
    data.allowedVisitTypes = Array.isArray(body.allowedVisitTypes) ? body.allowedVisitTypes : typeof body.allowedVisitTypes === "string" ? body.allowedVisitTypes : undefined;
  }
  const updated = await organizationService.patchOrganization(id, data);
  res.json(updated);
}

export async function getAppointments(req: Request, res: Response): Promise<void> {
  const { fromDate: qFrom, toDate: qTo, userId: qUserId } = req.query;
  const { fromDate: defFrom, toDate: defTo } = defaultFromTo();
  const fromStr = (typeof qFrom === "string" ? qFrom : null) || defFrom;
  const toStr = (typeof qTo === "string" ? qTo : null) || defTo;
  const userId = qUserId != null ? parseInt(String(qUserId), 10) : undefined;
  if (userId != null && Number.isNaN(userId)) {
    throw validationError("userId must be a number");
  }
  const fromDate = parseDateOnly(fromStr);
  const toDate = parseDateOnly(toStr);
  if (!fromDate) throw validationError("Invalid fromDate");
  if (!toDate) throw validationError("Invalid toDate");
  if (fromDate > toDate) throw validationError("fromDate must be before or equal to toDate");

  const list = await appointmentService.listAppointmentsForAdmin({
    fromDate: fromStr,
    toDate: toStr,
    userId,
  });
  res.json(list);
}

export async function getAppointment(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.appointmentId, 10);
  if (Number.isNaN(id)) throw validationError("Invalid appointmentId");
  const result = await appointmentService.getAppointment(id);
  res.json(result);
}

export async function createAppointment(req: Request, res: Response): Promise<void> {
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

export async function patchAppointment(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.appointmentId, 10);
  if (Number.isNaN(id)) throw validationError("Invalid appointmentId");
  const parsed = patchAppointmentSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const result = await appointmentService.patchAppointment(id, parsed.data);
  res.json(result);
}

export async function getProviders(req: Request, res: Response): Promise<void> {
  const orgId = req.query.organizationId != null ? parseInt(String(req.query.organizationId), 10) : undefined;
  const list = await providerService.listProviders({
    organizationId: orgId,
    forAdmin: true,
  });
  res.json(list);
}

export async function getAvailability(req: Request, res: Response): Promise<void> {
  const organizationId = req.query.organizationId != null ? parseInt(String(req.query.organizationId), 10) : undefined;
  const providerId = req.query.providerId != null ? parseInt(String(req.query.providerId), 10) : undefined;
  const visitType = typeof req.query.visitType === "string" ? req.query.visitType.trim() : undefined;
  const fromDate = typeof req.query.fromDate === "string" && req.query.fromDate.trim() ? req.query.fromDate.trim() : undefined;
  const toDate = typeof req.query.toDate === "string" && req.query.toDate.trim() ? req.query.toDate.trim() : undefined;
  const result = await availabilityService.listAvailability({
    organizationId,
    providerId,
    visitType,
    when: undefined,
    fromDate,
    toDate,
    preferredTimeOfDay: undefined,
  });
  res.json(result);
}

export async function getUserAppointments(req: Request, res: Response): Promise<void> {
  const userId = parseInt(req.params.userId, 10);
  if (Number.isNaN(userId)) throw validationError("Invalid userId");
  const { fromDate: qFrom, toDate: qTo } = req.query;
  const { fromDate: defFrom, toDate: defTo } = defaultFromTo();
  const fromStr = (typeof qFrom === "string" ? qFrom : null) || defFrom;
  const toStr = (typeof qTo === "string" ? qTo : null) || defTo;
  const fromDate = parseDateOnly(fromStr);
  const toDate = parseDateOnly(toStr);
  if (!fromDate) throw validationError("Invalid fromDate");
  if (!toDate) throw validationError("Invalid toDate");

  const list = await appointmentService.listAppointments({
    userId,
    fromDate: fromStr,
    toDate: toStr,
  });
  res.json(list);
}

export async function getApiKeys(_req: Request, res: Response): Promise<void> {
  const keys = await authService.listApiKeys();
  res.json(keys);
}

export async function createApiKey(req: Request, res: Response): Promise<void> {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() || null : null;
  const result = await authService.createApiKey(name);
  res.status(201).json(result);
}
