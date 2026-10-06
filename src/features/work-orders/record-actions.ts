"use server";

import { revalidatePath } from "next/cache";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { detailFields, detailsSchema, optionalText, partsFields, partsSchema } from "@/features/work-orders/details-schema";
import { originalRetrievalKey } from "@/features/work-orders/photo-upload";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { AccessDeniedError, UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser, getAuthorizedWorkOrder } from "@/services/authorization";
import { logCustomerNotification } from "@/services/notifications";
import { deletePrivateFile } from "@/services/private-storage";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function revalidateWorkOrder(workOrderId: string) {
  revalidatePath(`/workspace/work-orders/${workOrderId}`);
  revalidatePath(`/portal/work-orders/${workOrderId}`);
  revalidatePath("/workspace");
  revalidatePath("/portal");
}

const entrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("customer-update"), title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(10000), notifyCustomer: z.boolean() }),
  z.object({ kind: z.literal("internal-note"), body: z.string().trim().min(1).max(10000) }),
  z.object({ kind: z.literal("finding"), title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(10000), shareWithCustomer: z.boolean() }),
]);

/**
 * Posts to a work order's timeline: an update for the customer (optionally emailed), an
 * internal note for staff, or a finding that can be kept internal or shared.
 */
export async function postWorkOrderEntry(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const workOrderId = z.string().uuid().parse(value(formData, "workOrderId"));
    const entry = entrySchema.parse({
      kind: value(formData, "kind"),
      title: value(formData, "title"),
      body: value(formData, "body"),
      notifyCustomer: formData.get("notifyCustomer") === "on",
      shareWithCustomer: formData.get("shareWithCustomer") === "on",
    });
    const user = await getActiveInternalUser();
    const workOrder = await getAuthorizedWorkOrder(workOrderId);

    await prisma.$transaction(async (transaction) => {
      if (entry.kind === "finding") {
        const visibility = entry.shareWithCustomer ? "CUSTOMER_VISIBLE" : "INTERNAL_ONLY";
        const finding = await transaction.finding.create({ data: { workOrderId, title: entry.title, body: entry.body, visibility, createdById: user.id } });
        await recordAudit(transaction, { workOrderId, actorUserId: user.id, eventType: "finding.created", entityType: "Finding", entityId: finding.id, customerVisible: entry.shareWithCustomer });
        return;
      }
      const isCustomerUpdate = entry.kind === "customer-update";
      const update = await transaction.serviceUpdate.create({
        data: {
          workOrderId,
          title: isCustomerUpdate ? entry.title : "Internal note",
          body: entry.body,
          visibility: isCustomerUpdate ? "CUSTOMER_VISIBLE" : "INTERNAL_ONLY",
          notifyCustomer: isCustomerUpdate && entry.notifyCustomer,
          createdById: user.id,
        },
      });
      await recordAudit(transaction, {
        workOrderId,
        actorUserId: user.id,
        eventType: isCustomerUpdate ? "service-update.posted" : "internal-note.posted",
        entityType: "ServiceUpdate",
        entityId: update.id,
        customerVisible: isCustomerUpdate,
      });
      if (isCustomerUpdate && entry.notifyCustomer) {
        await logCustomerNotification(transaction, { companyId: workOrder.companyId, workOrderId, serviceUpdateId: update.id });
      }
    });
    revalidateWorkOrder(workOrderId);
    if (entry.kind === "customer-update") return entry.notifyCustomer ? "Update posted and the customer will be emailed." : "Update posted for the customer.";
    return entry.kind === "finding" ? "Finding added." : "Note added.";
  });
}

/** A stored value in a form that compares and reads well in the audit log: dates as text, decimals as numbers. */
function comparable(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return value ?? null;
}

/** Saves a work order's details and intake information, recording exactly what changed. */
export async function updateWorkOrderDetails(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const workOrderId = z.string().uuid().parse(value(formData, "workOrderId"));
    const input = detailsSchema.parse(Object.fromEntries(detailFields.map((field) => [field, value(formData, field) || (field === "copperClassification" ? "UNKNOWN" : "")])));
    const user = await getActiveInternalUser();
    await getAuthorizedWorkOrder(workOrderId);

    const changed = await prisma.$transaction(async (transaction) => {
      const current = await transaction.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: Object.fromEntries(detailFields.map((field) => [field, true])) as Record<(typeof detailFields)[number], true> });
      if (input.serviceCenterId) {
        const center = await transaction.serviceCenter.findUnique({ where: { id: input.serviceCenterId }, select: { id: true } });
        if (!center) throw new UserFacingError("Service center not found.");
      }
      const changes = Object.fromEntries(detailFields
        .filter((field) => comparable(current[field]) !== comparable(input[field]))
        .map((field) => [field, { from: comparable(current[field]), to: comparable(input[field]) }]));
      if (!Object.keys(changes).length) return false;
      await transaction.workOrder.update({ where: { id: workOrderId }, data: input });
      await recordAudit(transaction, { workOrderId, actorUserId: user.id, eventType: "work-order.details-updated", entityType: "WorkOrder", entityId: workOrderId, metadata: changes });
      return true;
    });
    revalidateWorkOrder(workOrderId);
    return changed ? "Details saved." : "No changes to save.";
  });
}

const photoCategories = ["ARRIVAL", "IDENTIFICATION", "INITIAL_CONDITION", "INSPECTION", "DISASSEMBLY", "FINDINGS", "REPAIR", "REPLACEMENT_PARTS", "TESTING", "FINAL_CONDITION", "SHIPPING"] as const;

/** Changes a photo's caption, category, or whether the customer can see it. */
/**
 * Saves the parts and quote details: what's needed, the kit, extra labor, and the dates the
 * customer was quoted and parts were ordered and received. Whoever records the parts as
 * received is taken as the person who inspected them, unless someone else is chosen.
 */
export async function updatePartsAndQuote(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const workOrderId = z.string().uuid().parse(value(formData, "workOrderId"));
    const input = partsSchema.parse(Object.fromEntries(partsFields.map((field) => [field, value(formData, field)])));
    const user = await getActiveInternalUser();
    await getAuthorizedWorkOrder(workOrderId);

    const changed = await prisma.$transaction(async (transaction) => {
      const current = await transaction.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: Object.fromEntries(partsFields.map((field) => [field, true])) as Record<(typeof partsFields)[number], true> });
      const data = { ...input, partsReceivedById: input.partsReceivedAt ? input.partsReceivedById ?? user.id : null };
      if (data.partsReceivedById && data.partsReceivedById !== user.id) {
        const receiver = await transaction.user.findUnique({ where: { id: data.partsReceivedById }, select: { internalRole: true } });
        if (!receiver?.internalRole) throw new UserFacingError("Choose the staff member who received the parts.");
      }
      const changes = Object.fromEntries(partsFields
        .filter((field) => comparable(current[field]) !== comparable(data[field]))
        .map((field) => [field, { from: comparable(current[field]), to: comparable(data[field]) }]));
      if (!Object.keys(changes).length) return false;
      await transaction.workOrder.update({ where: { id: workOrderId }, data });
      await recordAudit(transaction, { workOrderId, actorUserId: user.id, eventType: "work-order.parts-updated", entityType: "WorkOrder", entityId: workOrderId, metadata: changes });
      return true;
    });
    revalidateWorkOrder(workOrderId);
    return changed ? "Parts and quote saved." : "No changes to save.";
  });
}

export async function updatePhoto(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      attachmentId: z.string().uuid(),
      caption: optionalText(300),
      photoCategory: z.enum(photoCategories),
      visibility: z.enum(["INTERNAL_ONLY", "CUSTOMER_VISIBLE"]),
    }).parse({ attachmentId: value(formData, "attachmentId"), caption: value(formData, "caption"), photoCategory: value(formData, "photoCategory"), visibility: value(formData, "visibility") });
    const user = await getActiveInternalUser();
    const workOrderId = await prisma.$transaction(async (transaction) => {
      const photo = await transaction.attachment.findFirst({ where: { id: input.attachmentId, kind: "PHOTO" }, select: { id: true, workOrderId: true, caption: true, photoCategory: true, visibility: true } });
      if (!photo) throw new UserFacingError("Photo not found.");
      await transaction.attachment.update({ where: { id: photo.id }, data: { caption: input.caption, photoCategory: input.photoCategory, visibility: input.visibility } });
      await recordAudit(transaction, {
        workOrderId: photo.workOrderId,
        actorUserId: user.id,
        eventType: "photo.updated",
        entityType: "Attachment",
        entityId: photo.id,
        customerVisible: photo.visibility !== input.visibility && input.visibility === "CUSTOMER_VISIBLE",
        metadata: { previous: { caption: photo.caption, photoCategory: photo.photoCategory, visibility: photo.visibility }, caption: input.caption, photoCategory: input.photoCategory, visibility: input.visibility },
      });
      return photo.workOrderId;
    });
    revalidateWorkOrder(workOrderId);
    return "Photo saved.";
  });
}

/** Deletes a photo. The person who uploaded it can delete it; otherwise a manager or administrator must. */
export async function deletePhoto(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const attachmentId = z.string().uuid().parse(value(formData, "attachmentId"));
    const user = await getActiveInternalUser();
    const photo = await prisma.$transaction(async (transaction) => {
      const found = await transaction.attachment.findFirst({
        where: { id: attachmentId, kind: "PHOTO" },
        select: { id: true, workOrderId: true, fileName: true, uploadedById: true, originalStorageKey: true, optimizedStorageKey: true, thumbnailStorageKey: true },
      });
      if (!found) throw new UserFacingError("Photo not found.");
      const canDelete = found.uploadedById === user.id || user.internalRole === UserRole.PORTAL_ADMINISTRATOR || user.internalRole === UserRole.VACTECH_MANAGER;
      if (!canDelete) throw new AccessDeniedError("Only the person who uploaded this photo or a manager can delete it.");
      await transaction.attachment.delete({ where: { id: found.id } });
      await recordAudit(transaction, { workOrderId: found.workOrderId, actorUserId: user.id, eventType: "photo.deleted", entityType: "Attachment", entityId: found.id, metadata: { fileName: found.fileName } });
      return found;
    });
    // Includes any copy of the original that was retrieved from the archive.
    await Promise.all([photo.originalStorageKey, photo.optimizedStorageKey, photo.thumbnailStorageKey, originalRetrievalKey(photo.id)].filter((key): key is string => Boolean(key)).map(async (key) => {
      try {
        await deletePrivateFile(key);
      } catch (error) {
        console.error("Deleted photo's file could not be removed from storage.", { key, error });
      }
    }));
    revalidateWorkOrder(photo.workOrderId);
    return "Photo deleted.";
  });
}
