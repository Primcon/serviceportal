import { CopperClassification } from "@prisma/client";
import { z } from "zod";

export const optionalText = (max: number) => z.string().trim().max(max).transform((text) => text || null);

/** A calendar date from a date input ("2026-10-28"), stored as midnight UTC so it reads the same everywhere. */
export const optionalDate = z.string().trim().refine((text) => !text || /^\d{4}-\d{2}-\d{2}$/.test(text), "Enter a valid date.")
  .transform((text) => (text ? new Date(`${text}T00:00:00.000Z`) : null));

/** The work order fields staff can edit after intake, including the job order form (852-01-01) details. */
export const detailFields = [
  "summary", "priority", "serviceType", "customerPurchaseOrder", "rmaReference", "promisedAt", "serviceCenterId",
  "toolId", "oilType", "oilWeight", "reasonForService", "contaminants", "copperClassification", "accessoriesReceived",
  "customerContactName", "customerContactPhone", "customerContactEmail",
] as const;

export const detailsSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  priority: optionalText(60),
  serviceType: optionalText(60),
  customerPurchaseOrder: optionalText(80),
  rmaReference: optionalText(80),
  promisedAt: optionalDate,
  serviceCenterId: z.string().trim().uuid().or(z.literal("")).transform((id) => id || null),
  toolId: optionalText(80),
  oilType: optionalText(80),
  oilWeight: optionalText(40),
  reasonForService: optionalText(500),
  contaminants: optionalText(200),
  copperClassification: z.nativeEnum(CopperClassification),
  accessoriesReceived: optionalText(500),
  customerContactName: optionalText(120),
  customerContactPhone: optionalText(40),
  customerContactEmail: z.string().trim().max(254).refine((email) => !email || z.string().email().safeParse(email).success, "Enter a valid email address.").transform((email) => email || null),
});
