import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type ListProvidersParams = {
  organizationId?: number;
  specialty?: string;
  language?: string;
  gender?: string;
  /** Public API: true (default) = active only, limited fields. Admin: false = all providers, full model. */
  forAdmin?: boolean;
};

export async function listProviders(params: ListProvidersParams) {
  const where: Record<string, unknown> = {};
  if (params.forAdmin !== true) where.active = true;
  if (
    params.organizationId != null &&
    !Number.isNaN(params.organizationId)
  ) {
    where.organizationId = params.organizationId;
  }
  if (params.specialty) where.specialty = params.specialty;
  if (params.language) where.language = params.language;
  if (params.gender) where.gender = params.gender;

  const orderBy = [{ organizationId: "asc" as const }, { id: "asc" as const }];

  if (params.forAdmin === true) {
    return prisma.provider.findMany({
      where: where as never,
      orderBy,
    });
  }

  return prisma.provider.findMany({
    where: where as never,
    orderBy,
    select: {
      id: true,
      organizationId: true,
      name: true,
      specialty: true,
      language: true,
      gender: true,
    },
  });
}
