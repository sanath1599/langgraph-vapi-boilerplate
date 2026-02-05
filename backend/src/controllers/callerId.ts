import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../utils/phone";
import { config } from "../config";
import { validationError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

export async function normalize(req: Request, res: Response): Promise<void> {
  const rawNumber = typeof req.query.rawNumber === "string" ? req.query.rawNumber.trim() : "";
  if (!rawNumber) {
    throw validationError("Missing or invalid query: rawNumber");
  }
  const result = normalizePhone(rawNumber, config.defaultCountry);
  await prisma.callerId.create({
    data: {
      rawNumber,
      normalizedNumber: result.normalizedNumber,
      country: result.country,
      type: result.type,
    },
  }).catch(() => { /* persist for debugging only */ });
  res.json(result);
}

/** POST version: same as GET /normalize but accepts body { rawNumber }. */
export async function normalizePost(req: Request, res: Response): Promise<void> {
  const rawNumber = typeof req.body?.rawNumber === "string" ? req.body.rawNumber.trim() : "";
  if (!rawNumber) {
    throw validationError("Missing or invalid body: rawNumber");
  }
  const result = normalizePhone(rawNumber, config.defaultCountry);
  await prisma.callerId.create({
    data: {
      rawNumber,
      normalizedNumber: result.normalizedNumber,
      country: result.country,
      type: result.type,
    },
  }).catch(() => { /* persist for debugging only */ });
  res.json(result);
}
