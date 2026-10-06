"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { findOrCreateProductModel, modelDisplayName } from "@/features/work-orders/intake";
import { setWorkOrderAssignee } from "@/features/assignments/assign";
import { notifyDocumentShared } from "@/features/work-orders/document-notification";
import { unsignedStepsBefore } from "@/features/checklists/checklist";
import { shippingDefaults } from "@/features/warranty/queries";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser, getActiveInternalUserForRoles, getAuthorizedWorkOrder } from "@/services/authorization";
import { detectDocumentType, supportedDocumentDescription } from "@/services/file-types";
import { deletePrivateFile, storePrivateBuffer } from "@/services/private-storage";
import { logCustomerNotification, statusChangeNotification } from "@/services/notifications";

const requiredText = z.string().trim().min(1);
const documentTypeSchema = z.enum([
  "CUSTOMER_PO",
  "REPAIR_QUOTE",
  "INSPECTION_REPORT",
  "TEST_REPORT",
  "FINAL_SERVICE_REPORT",
  "SHIPPING_DOCUMENTATION",
  "INVOICE",
  "MANUAL",
  "WARRANTY_CERTIFICATE",
  "SIGNED_TRAVELER",
  "OTHER",
]);

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function storageKeyPrefix(workOrderId: string) {
  return `work-orders/${workOrderId}/${crypto.randomUUID()}`;
}

function safeFileName(file: File, fallback: string) {
  return file.name.split(/[\\/]/).pop() || fallback;
}

/** Removes stored files after a failed database write so storage never holds unreferenced uploads. */
async function discardStoredFiles(keys: string[]) {
  await Promise.all(keys.map(async (key) => {
    try {
      await deletePrivateFile(key);
    } catch (error) {
      console.error("Could not remove an orphaned upload.", { key, error });
    }
  }));
}

export async function createCompany(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ name: requiredText }).parse({ name: value(formData, "name") });
    const internalUser = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);

    await prisma.$transaction(async (transaction) => {
      const company = await transaction.company.create({ data: { name: input.name } });
      await recordAudit(transaction, { actorUserId: internalUser.id, eventType: "company.created", entityType: "Company", entityId: company.id });
    });
    revalidatePath("/workspace");
    revalidatePath("/portal");
  });
}

export async function createLocation(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({ companyId: requiredText, name: requiredText, addressLine: z.string().trim(), city: z.string().trim(), region: z.string().trim(), postalCode: z.string().trim(), country: z.string().trim() })
      .parse({
        companyId: value(formData, "companyId"),
        name: value(formData, "name"),
        addressLine: value(formData, "addressLine"),
        city: value(formData, "city"),
        region: value(formData, "region"),
        postalCode: value(formData, "postalCode"),
        country: value(formData, "country"),
      });
    const internalUser = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);

    await prisma.$transaction(async (transaction) => {
      const company = await transaction.company.findUnique({ where: { id: input.companyId }, select: { id: true } });
      if (!company) throw new UserFacingError("Company not found.");
      const location = await transaction.location.create({
        data: {
          ...input,
          addressLine: input.addressLine || null,
          city: input.city || null,
          region: input.region || null,
          postalCode: input.postalCode || null,
          country: input.country || null,
        },
      });
      await recordAudit(transaction, { actorUserId: internalUser.id, eventType: "location.created", entityType: "Location", entityId: location.id, metadata: { companyId: company.id } });
    });
    revalidatePath("/workspace");
  });
}

/** Adds a pump to a customer's register, linked to a catalog model (added to the catalog if it's new). */
export async function createEquipment(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({
        companyId: z.string().uuid("Choose the customer."),
        locationId: z.string().trim(),
        // "__new" is the form's "model not listed" choice; the new model's name comes from the fields below.
        productModelId: z.string().trim().uuid().or(z.literal("")).or(z.literal("__new")).transform((id) => (id && id !== "__new" ? id : null)),
        newManufacturer: z.string().trim().max(80),
        newModelName: z.string().trim().max(120),
        serialNumber: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500),
      })
      .parse({
        companyId: value(formData, "companyId"),
        locationId: value(formData, "locationId"),
        productModelId: value(formData, "productModelId"),
        newManufacturer: value(formData, "newManufacturer"),
        newModelName: value(formData, "newModelName"),
        serialNumber: value(formData, "serialNumber"),
        description: value(formData, "description"),
      });
    if (!input.productModelId && !input.newModelName) throw new UserFacingError("Choose the pump's model, or enter a new one.");
    const internalUser = await getActiveInternalUser();

    await prisma.$transaction(async (transaction) => {
      const company = await transaction.company.findFirst({ where: { id: input.companyId, archivedAt: null }, select: { id: true } });
      if (!company) throw new UserFacingError("Customer not found.");
      if (input.locationId) {
        const location = await transaction.location.findFirst({ where: { id: input.locationId, companyId: input.companyId }, select: { id: true } });
        if (!location) throw new UserFacingError("That location belongs to a different customer.");
      }
      const existingEquipment = await transaction.equipment.findFirst({
        where: {
          companyId: company.id,
          serialNumber: { equals: input.serialNumber, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existingEquipment) {
        throw new UserFacingError("This customer already has a pump with that serial number.");
      }
      const model = input.productModelId
        ? await transaction.productModel.findUnique({ where: { id: input.productModelId } })
        : await findOrCreateProductModel(transaction, input.newManufacturer || null, input.newModelName);
      if (!model) throw new UserFacingError("Model not found.");
      const equipment = await transaction.equipment.create({
        data: {
          companyId: company.id,
          locationId: input.locationId || null,
          productModelId: model.id,
          productModel: modelDisplayName(model.manufacturer, model.name),
          serialNumber: input.serialNumber,
          description: input.description || null,
        },
      });
      await recordAudit(transaction, { actorUserId: internalUser.id, eventType: "equipment.created", entityType: "Equipment", entityId: equipment.id });
    });
    revalidatePath("/workspace", "layout");
    return "Pump added.";
  });
}

export async function updateWorkOrderStatus(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({
        workOrderId: requiredText,
        serviceStageId: requiredText,
        condition: z.enum([
          "NORMAL",
          "WAITING_ON_PARTS",
          "AWAITING_CUSTOMER",
          "CUSTOMER_HOLD",
          "WARRANTY_REVIEW",
          "QUOTE_DECLINED",
          "CANCELLED",
        ]),
        note: z.string().trim().max(1000).transform((note) => note || null),
        // Who has it next: "keep" leaves the owner as is, "" returns it to the queue, otherwise a staff member.
        handoff: z.string().uuid().or(z.literal("")).or(z.literal("keep")),
        // A manager's reason for moving the job on with required checklist steps unsigned.
        overrideReason: z.string().trim().max(500).transform((reason) => reason || null),
      })
      .parse({
        workOrderId: value(formData, "workOrderId"),
        serviceStageId: value(formData, "serviceStageId"),
        condition: value(formData, "condition"),
        note: value(formData, "note"),
        handoff: formData.has("handoff") ? value(formData, "handoff") : "keep",
        overrideReason: value(formData, "overrideReason"),
      });
    const internalUser = await getActiveInternalUser();
    await getAuthorizedWorkOrder(input.workOrderId);
    const stage = await prisma.serviceStage.findUnique({
      where: { id: input.serviceStageId },
    });
    if (!stage) throw new UserFacingError("Service stage not found.");
    if (!stage.isActive) {
      throw new UserFacingError("Service stage is inactive.");
    }

    const changed = await prisma.$transaction(async (transaction) => {
      const workOrder = await transaction.workOrder.findUniqueOrThrow({
        where: { id: input.workOrderId },
        select: { id: true, companyId: true, workOrderNumber: true, serviceStageId: true, condition: true, customerFacingStatus: true, completedAt: true, assignedToId: true, checklistTemplateId: true, serviceStage: { select: { sequence: true } } },
      });
      // Moving forward needs every required checklist step of the earlier stages signed. A
      // manager can move it on regardless, with a reason. Cancelling a job is never held up.
      let overridden: string[] = [];
      if (stage.sequence > workOrder.serviceStage.sequence && input.condition !== "CANCELLED") {
        const unsigned = await unsignedStepsBefore(transaction, workOrder, stage.sequence);
        if (unsigned.length) {
          const labels = unsigned.map((step) => step.label);
          const isManager = internalUser.internalRole === UserRole.PORTAL_ADMINISTRATOR || internalUser.internalRole === UserRole.VACTECH_MANAGER;
          if (!isManager) throw new UserFacingError(`Sign ${labels.length === 1 ? "this step" : "these steps"} first: ${labels.join("; ")}. A manager can override.`);
          if (!input.overrideReason) throw new UserFacingError(`${labels.length === 1 ? "A required step is" : `${labels.length} required steps are`} unsigned: ${labels.join("; ")}. To move on anyway, give an override reason.`);
          overridden = labels;
        }
      }
      const isCompleted = stage.code === "COMPLETED";
      // Reaching Shipped records today as the ship date and starts the warranty, unless a ship date was already entered.
      const shipping = stage.code === "SHIPPED" && workOrder.serviceStageId !== stage.id && input.condition !== "CANCELLED" ? await shippingDefaults(transaction, workOrder.id) : null;
      // A finished or cancelled job isn't anyone's work any more.
      const nextAssigneeId = isCompleted || input.condition === "CANCELLED" ? null : input.handoff === "keep" ? workOrder.assignedToId : input.handoff || null;
      const stateChanged = workOrder.serviceStageId !== stage.id || workOrder.condition !== input.condition;
      if (!stateChanged) {
        // Only the owner changed: record the handoff (with the note) and leave the stage history alone.
        if (nextAssigneeId === workOrder.assignedToId) return false;
        await setWorkOrderAssignee(transaction, { workOrderId: input.workOrderId, assigneeId: nextAssigneeId, actorUserId: internalUser.id, note: input.note });
        return true;
      }
      await transaction.workOrder.update({
        where: { id: input.workOrderId },
        data: {
          serviceStageId: stage.id,
          customerFacingStatus: stage.customerFacingStatus,
          condition: input.condition,
          completedAt: isCompleted ? workOrder.completedAt ?? new Date() : null,
          ...(workOrder.serviceStageId !== stage.id ? { stageEnteredAt: new Date() } : {}),
          ...(shipping ?? {}),
        },
      });
      if (shipping) {
        await recordAudit(transaction, { workOrderId: input.workOrderId, actorUserId: internalUser.id, eventType: "work-order.shipping-updated", entityType: "WorkOrder", entityId: input.workOrderId, metadata: { shippedAt: { from: null, to: shipping.shippedAt.toISOString() }, warrantyMonths: shipping.warrantyMonths, warrantyEndsAt: shipping.warrantyEndsAt?.toISOString() ?? null } });
      }
      if (nextAssigneeId !== workOrder.assignedToId) {
        // The note is already on the stage change, so the handoff record doesn't repeat it.
        await setWorkOrderAssignee(transaction, { workOrderId: input.workOrderId, assigneeId: nextAssigneeId, actorUserId: internalUser.id, note: null });
      }
      const statusHistory = await transaction.workOrderStatusHistory.create({
        data: {
          workOrderId: input.workOrderId,
          serviceStageId: stage.id,
          condition: input.condition,
          changedById: internalUser.id,
          note: input.note,
          overrideReason: overridden.length ? input.overrideReason : null,
        },
      });
      if (overridden.length) {
        await recordAudit(transaction, { workOrderId: input.workOrderId, actorUserId: internalUser.id, eventType: "checklist.overridden", entityType: "WorkOrderStatusHistory", entityId: statusHistory.id, metadata: { reason: input.overrideReason, unsignedSteps: overridden, movedTo: stage.displayName } });
      }
      await recordAudit(transaction, {
        workOrderId: input.workOrderId,
        actorUserId: internalUser.id,
        eventType: "work-order.status-changed",
        entityType: "WorkOrder",
        entityId: input.workOrderId,
        customerVisible: true,
      });
      // Customers hear about changes to the status they can see, not every internal stage move.
      if (stage.customerFacingStatus !== workOrder.customerFacingStatus) {
        await logCustomerNotification(transaction, {
          companyId: workOrder.companyId,
          workOrderId: input.workOrderId,
          eventKey: `status-change:${statusHistory.id}`,
          ...statusChangeNotification({ workOrderId: input.workOrderId, workOrderNumber: workOrder.workOrderNumber, status: stage.customerFacingStatus }),
        });
      }
      return true;
    });

    revalidatePath("/workspace", "layout");
    revalidatePath("/portal");
    return changed ? "Service state updated." : "The stage and condition are unchanged. Use a note to add information.";
  });
}

function uploadedDocument(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new UserFacingError("A document is required.");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new UserFacingError("Documents must be 25 MB or smaller.");
  }
  return file;
}

export async function createInternalDocument(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({
        workOrderId: requiredText,
        documentType: documentTypeSchema,
        visibility: z.enum(["INTERNAL_ONLY", "CUSTOMER_VISIBLE"]),
      })
      .parse({
        workOrderId: value(formData, "workOrderId"),
        documentType: value(formData, "documentType"),
        visibility: value(formData, "visibility") || "INTERNAL_ONLY",
      });
    const file = uploadedDocument(formData);
    const internalUser = await getActiveInternalUser();
    const workOrder = await getAuthorizedWorkOrder(input.workOrderId);
    const content = Buffer.from(await file.arrayBuffer());
    const fileName = safeFileName(file, "document");
    const documentMimeType = detectDocumentType(content, fileName);
    if (!documentMimeType) {
      throw new UserFacingError(`${fileName} isn't a supported document type. Upload ${supportedDocumentDescription}.`);
    }
    const originalKey = `${storageKeyPrefix(input.workOrderId)}/original`;
    const stored = await storePrivateBuffer({ key: originalKey, content, contentType: documentMimeType });
    if (!stored) {
      throw new UserFacingError("Private file storage is not configured.");
    }
    try {
      await prisma.$transaction(async (transaction) => {
        const attachment = await transaction.attachment.create({
          data: {
            workOrderId: input.workOrderId,
            equipmentId: workOrder.equipmentId,
            serviceStageId: workOrder.serviceStageId,
            kind: "DOCUMENT",
            visibility: input.visibility,
            documentType: input.documentType,
            originalStorageKey: originalKey,
            fileName,
            mimeType: documentMimeType,
            sizeBytes: file.size,
            uploadedById: internalUser.id,
          },
        });
        await recordAudit(transaction, {
          workOrderId: input.workOrderId,
          actorUserId: internalUser.id,
          eventType: "document.uploaded",
          entityType: "Attachment",
          entityId: attachment.id,
          customerVisible: input.visibility === "CUSTOMER_VISIBLE",
        });
        if (input.visibility === "CUSTOMER_VISIBLE") await notifyDocumentShared(transaction, { id: attachment.id, workOrderId: input.workOrderId, documentType: input.documentType, fileName });
      });
    } catch (error) {
      await discardStoredFiles([originalKey]);
      throw error;
    }
    revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
  });
}
