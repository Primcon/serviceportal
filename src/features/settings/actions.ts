"use server";

import { revalidatePath } from "next/cache";
import { ListKind } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { managerRoles } from "@/features/navigation/workspace-items";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUserForRoles } from "@/services/authorization";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

const optionalId = z.string().trim().uuid().or(z.literal("")).transform((id) => id || null);

/** Adds a picklist option, or renames, reorders or retires an existing one. */
export async function saveListOption(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      id: optionalId,
      kind: z.nativeEnum(ListKind),
      label: z.string().trim().min(1).max(60),
      sortOrder: z.coerce.number().int().min(0).max(999),
      isActive: z.boolean(),
    }).parse({
      id: value(formData, "id"),
      kind: value(formData, "kind"),
      label: value(formData, "label"),
      sortOrder: value(formData, "sortOrder") || "0",
      isActive: formData.get("isActive") === "on" || !formData.has("isActiveField"),
    });
    const actor = await getActiveInternalUserForRoles(managerRoles);

    await prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.listOption.findFirst({
        where: { kind: input.kind, label: { equals: input.label, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) },
        select: { id: true },
      });
      if (duplicate) throw new UserFacingError(`"${input.label}" is already in this list.`);
      const data = { kind: input.kind, label: input.label, sortOrder: input.sortOrder, isActive: input.isActive };
      const option = input.id
        ? await transaction.listOption.update({ where: { id: input.id }, data })
        : await transaction.listOption.create({ data });
      await recordAudit(transaction, {
        actorUserId: actor.id,
        eventType: input.id ? "list-option.updated" : "list-option.created",
        entityType: "ListOption",
        entityId: option.id,
        metadata: data,
      });
    });
    revalidatePath("/workspace/settings");
    return input.id ? "Option saved." : `"${input.label}" added.`;
  });
}

/** Adds a service center, or renames or deactivates an existing one. Codes are fixed once used. */
export async function saveServiceCenter(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      id: optionalId,
      code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, "Use 2 to 4 letters, such as AZ."),
      name: z.string().trim().min(1).max(80),
      isActive: z.boolean(),
    }).parse({
      id: value(formData, "id"),
      code: value(formData, "code"),
      name: value(formData, "name"),
      isActive: formData.get("isActive") === "on" || !formData.has("isActiveField"),
    });
    const actor = await getActiveInternalUserForRoles(managerRoles);

    await prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.serviceCenter.findFirst({
        where: { code: input.code, ...(input.id ? { id: { not: input.id } } : {}) },
        select: { id: true },
      });
      if (duplicate) throw new UserFacingError(`Service center ${input.code} already exists.`);
      if (input.id) {
        const existing = await transaction.serviceCenter.findUnique({ where: { id: input.id }, select: { code: true, _count: { select: { workOrders: true } } } });
        if (!existing) throw new UserFacingError("Service center not found.");
        if (existing.code !== input.code && existing._count.workOrders > 0) {
          throw new UserFacingError("This center's code is already part of work order numbers, so it can't be changed. Rename it instead.");
        }
      }
      const data = { code: input.code, name: input.name, isActive: input.isActive };
      const center = input.id
        ? await transaction.serviceCenter.update({ where: { id: input.id }, data })
        : await transaction.serviceCenter.create({ data });
      await recordAudit(transaction, {
        actorUserId: actor.id,
        eventType: input.id ? "service-center.updated" : "service-center.created",
        entityType: "ServiceCenter",
        entityId: center.id,
        metadata: data,
      });
    });
    revalidatePath("/workspace/settings");
    return input.id ? "Service center saved." : `${input.code} added.`;
  });
}
