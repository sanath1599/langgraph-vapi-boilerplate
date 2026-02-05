import { z } from "zod";

export const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.string().min(1),
  gender: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  insurance: z.string().optional(),
  chronicConditions: z.string().optional(),
  allergies: z.string().optional(),
  externalId: z.string().optional(),
});

export const patchUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dob: z.string().min(1).optional(),
  gender: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  status: z.enum(["active", "inactive", "deceased"]).optional(),
  phone: z.string().optional(),
  address: z.string().optional().nullable(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type PatchUserInput = z.infer<typeof patchUserSchema>;
