import type { Request, Response } from "express";
import * as providerService from "../services/providerService";

export async function get(req: Request, res: Response): Promise<void> {
  const organizationId =
    req.query.organizationId != null
      ? parseInt(String(req.query.organizationId), 10)
      : undefined;
  const specialty =
    typeof req.query.specialty === "string" ? req.query.specialty : undefined;
  const language =
    typeof req.query.language === "string" ? req.query.language : undefined;
  const gender =
    typeof req.query.gender === "string" ? req.query.gender : undefined;
  const list = await providerService.listProviders({
    organizationId,
    specialty,
    language,
    gender,
    forAdmin: false,
  });
  res.json(list);
}

export async function listPost(req: Request, res: Response): Promise<void> {
  const body = req.body ?? {};
  const organizationId =
    body.organizationId != null
      ? parseInt(String(body.organizationId), 10)
      : undefined;
  const specialty =
    typeof body.specialty === "string" ? body.specialty : undefined;
  const language =
    typeof body.language === "string" ? body.language : undefined;
  const gender = typeof body.gender === "string" ? body.gender : undefined;
  const list = await providerService.listProviders({
    organizationId,
    specialty,
    language,
    gender,
    forAdmin: false,
  });
  res.json(list);
}
