"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { managerRoles } from "@/features/navigation/workspace-items";
import { mergeCompanyRecords, mergeEquipmentRecords, openWorkOrderWhere } from "@/features/records/merge";
import { findOrCreateProductModel, modelDisplayName } from "@/features/work-orders/intake";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser, getActiveInternalUserForRoles } from "@/services/authorization";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

const id = z.string().uuid();
const optionalId = z.string().trim().uuid().or(z.literal("")).transform((text) => text || null);
const optionalText = (max: number) => z.string().trim().max(max).transform((text) => text || null);
const archivedFlag = z.enum(["true", "false"]).transform((text) => text === "true");

function revalidateRecords() {
  revalidatePath("/workspace", "layout");
  revalidatePath("/portal", "layout");
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Renames a customer. Two active customers can't share a name; merge them instead. */
export async function updateCompany(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ companyId: id, name: z.string().trim().min(1).max(160) }).parse({ companyId: value(formData, "companyId"), name: value(formData, "name") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const company = await transaction.company.findUnique({ where: { id: input.companyId } });
      if (!company) throw new UserFacingError("Customer not found.");
      if (company.name === input.name) return;
      const sameName = await transaction.company.findFirst({ where: { id: { not: company.id }, archivedAt: null, name: { equals: input.name, mode: "insensitive" } }, select: { id: true } });
      if (sameName) throw new UserFacingError("Another customer already has that name. If they're the same company, merge them instead.");
      await transaction.company.update({ where: { id: company.id }, data: { name: input.name } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "company.renamed", entityType: "Company", entityId: company.id, metadata: { from: company.name, to: input.name } });
    });
    revalidateRecords();
    return "Customer saved.";
  });
}

/** Archives a customer (hidden from pickers and lists, history kept) or restores it. */
export async function setCompanyArchived(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ companyId: id, archived: archivedFlag }).parse({ companyId: value(formData, "companyId"), archived: value(formData, "archived") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const company = await transaction.company.findUnique({ where: { id: input.companyId } });
      if (!company) throw new UserFacingError("Customer not found.");
      if (company.mergedIntoId) throw new UserFacingError("This customer was merged into another and can't be restored.");
      if (Boolean(company.archivedAt) === input.archived) return;
      if (input.archived) {
        const open = await transaction.workOrder.count({ where: { companyId: company.id, ...openWorkOrderWhere } });
        if (open) throw new UserFacingError(`This customer has ${plural(open, "open work order")}. Complete or cancel ${open === 1 ? "it" : "them"} before archiving.`);
      }
      await transaction.company.update({ where: { id: company.id }, data: { archivedAt: input.archived ? new Date() : null } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: input.archived ? "company.archived" : "company.restored", entityType: "Company", entityId: company.id });
    });
    revalidateRecords();
    return input.archived ? "Customer archived." : "Customer restored.";
  });
}

/** Merges a duplicate customer into the one being kept. */
export async function mergeCompanies(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ duplicateId: id, keepId: z.string().uuid("Choose the customer to keep.") }).parse({ duplicateId: value(formData, "duplicateId"), keepId: value(formData, "keepId") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    const result = await prisma.$transaction((transaction) => mergeCompanyRecords(transaction, { ...input, actorUserId: actor.id }), { timeout: 60_000 });
    revalidateRecords();
    return `Merged. ${plural(result.workOrdersMoved, "work order")} and ${plural(result.pumpsMoved, "pump")} moved.`;
  });
}

const locationFields = z.object({
  name: z.string().trim().min(1).max(160),
  addressLine: optionalText(200),
  city: optionalText(120),
  region: optionalText(120),
  postalCode: optionalText(40),
  country: optionalText(120),
});

function locationInput(formData: FormData) {
  return locationFields.parse(Object.fromEntries(Object.keys(locationFields.shape).map((field) => [field, value(formData, field)])));
}

/** Edits a location's name and address. */
export async function updateLocation(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const locationId = id.parse(value(formData, "locationId"));
    const data = locationInput(formData);
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const location = await transaction.location.findUnique({ where: { id: locationId } });
      if (!location) throw new UserFacingError("Location not found.");
      const sameName = await transaction.location.findFirst({ where: { id: { not: location.id }, companyId: location.companyId, name: { equals: data.name, mode: "insensitive" } }, select: { id: true } });
      if (sameName) throw new UserFacingError("This customer already has a location with that name.");
      await transaction.location.update({ where: { id: location.id }, data });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "location.updated", entityType: "Location", entityId: location.id, metadata: { companyId: location.companyId, previousName: location.name, name: data.name } });
    });
    revalidateRecords();
    return "Location saved.";
  });
}

/** Archives a location (no longer offered for new pumps or work orders) or restores it. */
export async function setLocationArchived(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ locationId: id, archived: archivedFlag }).parse({ locationId: value(formData, "locationId"), archived: value(formData, "archived") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const location = await transaction.location.findUnique({ where: { id: input.locationId } });
      if (!location) throw new UserFacingError("Location not found.");
      if (Boolean(location.archivedAt) === input.archived) return;
      await transaction.location.update({ where: { id: location.id }, data: { archivedAt: input.archived ? new Date() : null } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: input.archived ? "location.archived" : "location.restored", entityType: "Location", entityId: location.id, metadata: { companyId: location.companyId } });
    });
    revalidateRecords();
    return input.archived ? "Location archived." : "Location restored.";
  });
}

const equipmentFields = z.object({
  equipmentId: id,
  // "__new" is the form's "model not listed" choice; the new model's name comes from the fields below.
  productModelId: z.string().trim().uuid().or(z.literal("__new")).or(z.literal("")).transform((text) => (text && text !== "__new" ? text : null)),
  newManufacturer: z.string().trim().max(80),
  newModelName: z.string().trim().max(120),
  serialNumber: z.string().trim().min(1).max(120),
  locationId: optionalId,
  description: optionalText(500),
});

/** Corrects a pump's model, serial number, location or description. */
export async function updateEquipment(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = equipmentFields.parse(Object.fromEntries(Object.keys(equipmentFields.shape).map((field) => [field, value(formData, field)])));
    if (!input.productModelId && !input.newModelName) throw new UserFacingError("Choose the pump's model, or enter a new one.");
    const actor = await getActiveInternalUser();
    await prisma.$transaction(async (transaction) => {
      const equipment = await transaction.equipment.findUnique({ where: { id: input.equipmentId } });
      if (!equipment) throw new UserFacingError("Pump not found.");
      if (equipment.mergedIntoId) throw new UserFacingError("This pump was merged into another. Edit that one instead.");
      if (input.locationId) {
        const location = await transaction.location.findFirst({ where: { id: input.locationId, companyId: equipment.companyId }, select: { id: true } });
        if (!location) throw new UserFacingError("That location belongs to a different customer.");
      }
      const sameSerial = await transaction.equipment.findFirst({ where: { id: { not: equipment.id }, companyId: equipment.companyId, serialNumber: { equals: input.serialNumber, mode: "insensitive" } }, select: { id: true } });
      if (sameSerial) throw new UserFacingError("This customer already has a pump with that serial number. If they're the same pump, merge them instead.");
      const model = input.productModelId
        ? await transaction.productModel.findUnique({ where: { id: input.productModelId } })
        : await findOrCreateProductModel(transaction, input.newManufacturer || null, input.newModelName);
      if (!model) throw new UserFacingError("Model not found.");

      const data = { productModelId: model.id, productModel: modelDisplayName(model.manufacturer, model.name), serialNumber: input.serialNumber, locationId: input.locationId, description: input.description };
      const changed = (Object.keys(data) as (keyof typeof data)[]).filter((field) => equipment[field] !== data[field]);
      if (!changed.length) return;
      await transaction.equipment.update({ where: { id: equipment.id }, data });
      await recordAudit(transaction, {
        actorUserId: actor.id,
        eventType: "equipment.updated",
        entityType: "Equipment",
        entityId: equipment.id,
        metadata: { changed, ...(changed.includes("serialNumber") ? { previousSerialNumber: equipment.serialNumber } : {}), ...(changed.includes("productModel") ? { previousModel: equipment.productModel } : {}) },
      });
    });
    revalidateRecords();
    return "Pump saved.";
  });
}

/** Archives a pump (out of service: hidden from intake search, history kept) or restores it. */
export async function setEquipmentArchived(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ equipmentId: id, archived: archivedFlag }).parse({ equipmentId: value(formData, "equipmentId"), archived: value(formData, "archived") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const equipment = await transaction.equipment.findUnique({ where: { id: input.equipmentId } });
      if (!equipment) throw new UserFacingError("Pump not found.");
      if (equipment.mergedIntoId) throw new UserFacingError("This pump was merged into another and can't be restored.");
      if (Boolean(equipment.archivedAt) === input.archived) return;
      if (input.archived) {
        const open = await transaction.workOrder.count({ where: { equipmentId: equipment.id, ...openWorkOrderWhere } });
        if (open) throw new UserFacingError("This pump has an open work order. Complete or cancel it before archiving.");
      }
      await transaction.equipment.update({ where: { id: equipment.id }, data: { archivedAt: input.archived ? new Date() : null } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: input.archived ? "equipment.archived" : "equipment.restored", entityType: "Equipment", entityId: equipment.id });
    });
    revalidateRecords();
    return input.archived ? "Pump archived." : "Pump restored.";
  });
}

/** Merges a duplicate pump into the one being kept. */
export async function mergeEquipment(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ duplicateId: id, keepId: z.string().uuid("Search for the pump to keep and choose it.") }).parse({ duplicateId: value(formData, "duplicateId"), keepId: value(formData, "keepId") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    const result = await prisma.$transaction((transaction) => mergeEquipmentRecords(transaction, { ...input, actorUserId: actor.id }));
    revalidateRecords();
    return `Merged. ${plural(result.workOrdersMoved, "work order")} moved.`;
  });
}
