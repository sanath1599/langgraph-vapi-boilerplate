import type { Request, Response } from "express";
import * as availabilityService from "../services/availabilityService";
import type { TimeOfDay } from "../utils/dateHelpers";

function parseParamsFromQuery(req: Request): availabilityService.AvailabilityParams {
  return {
    organizationId:
      req.query.organizationId != null
        ? parseInt(String(req.query.organizationId), 10)
        : undefined,
    providerId:
      req.query.providerId != null
        ? parseInt(String(req.query.providerId), 10)
        : undefined,
    visitType:
      typeof req.query.visitType === "string" ? req.query.visitType : undefined,
    when:
      typeof req.query.when === "string" ? req.query.when.trim() : undefined,
    fromDate:
      typeof req.query.fromDate === "string" && req.query.fromDate.trim()
        ? req.query.fromDate.trim()
        : undefined,
    toDate:
      typeof req.query.toDate === "string" && req.query.toDate.trim()
        ? req.query.toDate.trim()
        : undefined,
    preferredTimeOfDay:
      typeof req.query.preferredTimeOfDay === "string"
        ? (req.query.preferredTimeOfDay as TimeOfDay)
        : undefined,
  };
}

function parseParamsFromBody(req: Request): availabilityService.AvailabilityParams {
  const body = req.body ?? {};
  return {
    organizationId:
      body.organizationId != null
        ? parseInt(String(body.organizationId), 10)
        : undefined,
    providerId:
      body.providerId != null
        ? parseInt(String(body.providerId), 10)
        : undefined,
    visitType: typeof body.visitType === "string" ? body.visitType : undefined,
    when: typeof body.when === "string" ? body.when.trim() : undefined,
    fromDate:
      typeof body.fromDate === "string" && body.fromDate.trim()
        ? body.fromDate.trim()
        : undefined,
    toDate:
      typeof body.toDate === "string" && body.toDate.trim()
        ? body.toDate.trim()
        : undefined,
    preferredTimeOfDay:
      typeof body.preferredTimeOfDay === "string"
        ? (body.preferredTimeOfDay as TimeOfDay)
        : undefined,
  };
}

export async function get(req: Request, res: Response): Promise<void> {
  const params = parseParamsFromQuery(req);
  const result = await availabilityService.listAvailability(params);
  res.json(result);
}

export async function listPost(req: Request, res: Response): Promise<void> {
  const params = parseParamsFromBody(req);
  const result = await availabilityService.listAvailability(params);
  res.json(result);
}
