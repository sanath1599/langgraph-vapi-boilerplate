import type { Request, Response } from "express";
import { createUserSchema, patchUserSchema } from "../types/user";
import { validationError } from "../middleware/errorHandler";
import * as userService from "../services/userService";

export async function byPhone(req: Request, res: Response): Promise<void> {
  const phone = typeof req.query.phone === "string" ? req.query.phone : "";
  if (!phone) throw validationError("Missing query: phone");
  const list = await userService.findByPhone(phone);
  res.json(list);
}

/** POST version: same as GET /by-phone but accepts body { phone }. */
export async function byPhonePost(req: Request, res: Response): Promise<void> {
  const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
  if (!phone) throw validationError("Missing body: phone");
  const list = await userService.findByPhone(phone);
  res.json(list);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.userId, 10);
  if (Number.isNaN(id)) throw validationError("Invalid userId");
  const user = await userService.getOrThrow(id);
  res.json(user);
}

/** POST version: same as GET /:userId but accepts body { userId }. */
export async function getByIdPost(req: Request, res: Response): Promise<void> {
  const raw = req.body?.userId;
  const id = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(id)) throw validationError("Invalid or missing body: userId");
  const user = await userService.getOrThrow(id);
  res.json(user);
}

export async function search(req: Request, res: Response): Promise<void> {
  const name = typeof req.query.name === "string" ? req.query.name : undefined;
  const dob = typeof req.query.dob === "string" ? req.query.dob : undefined;
  const phone = typeof req.query.phone === "string" ? req.query.phone : undefined;
  const email = typeof req.query.email === "string" ? req.query.email : undefined;
  const memberId = typeof req.query.memberId === "string" ? req.query.memberId : undefined;
  const fuzzy = typeof req.query.fuzzy === "string" ? req.query.fuzzy : undefined;
  const list = await userService.search({ name, dob, phone, email, memberId, fuzzy });
  res.json(list);
}

/** POST version: same as GET /search but accepts body { name?, dob?, phone?, email?, memberId?, fuzzy? }. */
export async function searchPost(req: Request, res: Response): Promise<void> {
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name : undefined;
  const dob = typeof body.dob === "string" ? body.dob : undefined;
  const phone = typeof body.phone === "string" ? body.phone : undefined;
  const email = typeof body.email === "string" ? body.email : undefined;
  const memberId = typeof body.memberId === "string" ? body.memberId : undefined;
  const fuzzy = typeof body.fuzzy === "string" ? body.fuzzy : undefined;
  const list = await userService.search({ name, dob, phone, email, memberId, fuzzy });
  res.json(list);
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const result = await userService.createUser(parsed.data);
  res.status(201).json(result);
}

export async function validateRegistration(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.userId, 10);
  if (Number.isNaN(id)) throw validationError("Invalid userId");
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const result = await userService.validateRegistration(parsed.data);
  res.json(result);
}

export async function patch(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.userId, 10);
  if (Number.isNaN(id)) throw validationError("Invalid userId");
  const parsed = patchUserSchema.safeParse(req.body);
  if (!parsed.success) throw validationError("Validation failed", parsed.error.flatten());
  const updated = await userService.patchUser(id, parsed.data);
  res.json(updated);
}
