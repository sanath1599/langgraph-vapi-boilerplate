import type { Request, Response } from "express";
import { validationError, notFoundError } from "../middleware/errorHandler";
import * as organizationService from "../services/organizationService";

export async function getBookingRules(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.orgId, 10);
  if (Number.isNaN(id)) throw notFoundError("Invalid orgId");
  const result = await organizationService.getBookingRules(id);
  res.json(result);
}

export async function getBookingRulesPost(req: Request, res: Response): Promise<void> {
  const raw = req.body?.organizationId;
  const id = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(id)) throw validationError("Invalid or missing body: organizationId");
  const result = await organizationService.getBookingRules(id);
  res.json(result);
}
