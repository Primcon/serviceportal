"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser, getActiveInternalUserForRoles, getAuthorizedWorkOrder } from "@/services/authorization";
import { detectDocumentType, detectPhotoType, supportedDocumentDescription, supportedPhotoDescription } from "@/services/file-types";
import { deletePrivateFile, storePrivateBuffer } from "@/services/private-storage";
import { logCustomerNotification, statusChangeNotification } from "@/services/notifications";
import { ensureInitialStages } from "./initial-stages";

const requiredText = z.string().trim().min(1);
const photoCategorySchema = z.enum([
  "ARRIVAL",
  "IDENTIFICATION",
  "INITIAL_CONDITION",
  "INSPECTION",
  "DISASSEMBLY",
  "FINDINGS",
  "REPAIR",
  "REPLACEMENT_PARTS",
  "TESTING",
  "FINAL_CONDITION",
  "SHIPPING",
]);
const documentTypeSchema = z.enum([
  "CUSTOMER_PO",
  "REPAIR_QUOTE",
  "INSPECTION_REPORT",
  "TEST_REPORT",
  "FINAL_SERVICE_REPORT",
  "SHIPPING_DOCUMENTATION",
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

export async function createEquipment(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({
        companyId: requiredText,
        locationId: z.string().trim(),
        productModel: requiredText,
        serialNumber: requiredText,
        description: z.string().trim(),
      })
      .parse({
        companyId: value(formData, "companyId"),
        locationId: value(formData, "locationId"),
        productModel: value(formData, "productModel"),
        serialNumber: value(formData, "serialNumber"),
        description: value(formData, "description"),
      });
    const internalUser = await getActiveInternalUser();

    await prisma.$transaction(async (transaction) => {
      const company = await transaction.company.findUnique({ where: { id: input.companyId }, select: { id: true } });
      if (!company) throw new UserFacingError("Company not found.");
      if (input.locationId) {
        const location = await transaction.location.findFirst({ where: { id: input.locationId, companyId: input.companyId }, select: { id: true } });
        if (!location) throw new UserFacingError("Location does not belong to the selected company.");
      }
      const existingEquipment = await transaction.equipment.findFirst({
        where: {
          companyId: company.id,
          serialNumber: { equals: input.serialNumber, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existingEquipment) {
        throw new UserFacingError("Equipment with this serial number already exists for the selected company.");
      }
      const equipment = await transaction.equipment.create({
        data: {
          ...input,
          companyId: company.id,
          locationId: input.locationId || null,
          description: input.description || null,
        },
      });
      await recordAudit(transaction, { actorUserId: internalUser.id, eventType: "equipment.created", entityType: "Equipment", entityId: equipment.id });
    });
    revalidatePath("/workspace");
  });
}

export async function createWorkOrder(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({
        equipmentId: requiredText,
        workOrderNumber: requiredText,
        summary: requiredText,
        serviceType: z.string().trim(),
        priority: z.string().trim(),
      })
      .parse({
        equipmentId: value(formData, "equipmentId"),
        workOrderNumber: value(formData, "workOrderNumber"),
        summary: value(formData, "summary"),
        serviceType: value(formData, "serviceType"),
        priority: value(formData, "priority"),
      });
    const internalUser = await getActiveInternalUser();
    const receivedStage = await prisma.serviceStage.findUnique({ where: { code: "RECEIVED" } }) ?? await ensureInitialStages(prisma);

    await prisma.$transaction(async (transaction) => {
      const equipment = await transaction.equipment.findUnique({ where: { id: input.equipmentId } });
      if (!equipment) throw new UserFacingError("Equipment not found.");
      const duplicate = await transaction.workOrder.findUnique({
        where: { companyId_workOrderNumber: { companyId: equipment.companyId, workOrderNumber: input.workOrderNumber } },
        select: { id: true },
      });
      if (duplicate) throw new UserFacingError("This customer already has a work order with that number.");
      const workOrder = await transaction.workOrder.create({
        data: {
          ...input,
          companyId: equipment.companyId,
          locationId: equipment.locationId,
          serviceType: input.serviceType || null,
          priority: input.priority || null,
          serviceStageId: receivedStage.id,
          customerFacingStatus: receivedStage.customerFacingStatus,
          createdById: internalUser.id,
          receivedAt: new Date(),
        },
      });
      await transaction.workOrderStatusHistory.create({
        data: {
          workOrderId: workOrder.id,
          serviceStageId: receivedStage.id,
          condition: workOrder.condition,
          changedById: internalUser.id,
        },
      });
      await recordAudit(transaction, {
        workOrderId: workOrder.id,
        actorUserId: internalUser.id,
        eventType: "work-order.created",
        entityType: "WorkOrder",
        entityId: workOrder.id,
        customerVisible: true,
      });
    });
    revalidatePath("/workspace");
    revalidatePath("/portal");
  });
}

export async function createCustomerVisibleUpdate(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({
        workOrderId: requiredText,
        title: requiredText,
        body: requiredText,
        notifyCustomer: z.boolean().default(false),
      })
      .parse({
        workOrderId: value(formData, "workOrderId"),
        title: value(formData, "title"),
        body: value(formData, "body"),
        notifyCustomer: formData.get("notifyCustomer") === "on" || formData.get("notifyCustomer") === "true",
      });
    const internalUser = await getActiveInternalUser();
    const workOrder = await getAuthorizedWorkOrder(input.workOrderId);

    await prisma.$transaction(async (transaction) => {
      const update = await transaction.serviceUpdate.create({
        data: {
          workOrderId: input.workOrderId,
          title: input.title,
          body: input.body,
          visibility: "CUSTOMER_VISIBLE",
          notifyCustomer: input.notifyCustomer,
          createdById: internalUser.id,
        },
      });
      await recordAudit(transaction, {
        workOrderId: input.workOrderId,
        actorUserId: internalUser.id,
        eventType: "service-update.posted",
        entityType: "ServiceUpdate",
        entityId: update.id,
        customerVisible: true,
      });
      if (input.notifyCustomer) {
        await logCustomerNotification(transaction, {
          companyId: workOrder.companyId,
          workOrderId: input.workOrderId,
          serviceUpdateId: update.id,
        });
      }
    });
    revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
    revalidatePath(`/portal/work-orders/${input.workOrderId}`);
    revalidatePath("/portal/notifications");
    revalidatePath("/workspace");
    revalidatePath("/portal");
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
      })
      .parse({
        workOrderId: value(formData, "workOrderId"),
        serviceStageId: value(formData, "serviceStageId"),
        condition: value(formData, "condition"),
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

    await prisma.$transaction(async (transaction) => {
      const workOrder = await transaction.workOrder.findUniqueOrThrow({
        where: { id: input.workOrderId },
        select: { companyId: true, workOrderNumber: true, serviceStageId: true, condition: true, customerFacingStatus: true, completedAt: true },
      });
      if (workOrder.serviceStageId === stage.id && workOrder.condition === input.condition) {
        return;
      }
      const isCompleted = stage.code === "COMPLETED";
      await transaction.workOrder.update({
        where: { id: input.workOrderId },
        data: {
          serviceStageId: stage.id,
          customerFacingStatus: stage.customerFacingStatus,
          condition: input.condition,
          completedAt: isCompleted ? workOrder.completedAt ?? new Date() : null,
        },
      });
      const statusHistory = await transaction.workOrderStatusHistory.create({
        data: {
          workOrderId: input.workOrderId,
          serviceStageId: stage.id,
          condition: input.condition,
          changedById: internalUser.id,
        },
      });
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
    });

    revalidatePath("/workspace");
    revalidatePath("/portal");
  });
}

export async function createInternalFinding(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({ workOrderId: requiredText, title: requiredText, body: requiredText })
      .parse({
        workOrderId: value(formData, "workOrderId"),
        title: value(formData, "title"),
        body: value(formData, "body"),
      });
    const internalUser = await getActiveInternalUser();
    await getAuthorizedWorkOrder(input.workOrderId);
    await prisma.$transaction(async (transaction) => {
      const finding = await transaction.finding.create({
        data: {
          ...input,
          createdById: internalUser.id,
        },
      });
      await recordAudit(transaction, {
        workOrderId: input.workOrderId,
        actorUserId: internalUser.id,
        eventType: "finding.created",
        entityType: "Finding",
        entityId: finding.id,
      });
    });
    revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
    revalidatePath("/workspace");
  });
}

export async function createCustomerVisiblePhotos(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({ workOrderId: requiredText, photoCategory: photoCategorySchema })
      .parse({
        workOrderId: value(formData, "workOrderId"),
        photoCategory: value(formData, "photoCategory"),
      });
    const fileEntries = formData.getAll("files");
    const files = fileEntries.filter((file): file is File => file instanceof File);
    if (!files.length || files.length !== fileEntries.length || files.some((file) => file.size === 0)) {
      throw new UserFacingError("At least one photo is required.");
    }
    if (files.length > 20) {
      throw new UserFacingError("Upload up to 20 photos at a time.");
    }
    const oversized = files.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      throw new UserFacingError(`${safeFileName(oversized, "A photo")} is larger than 10 MB.`);
    }

    const internalUser = await getActiveInternalUser();
    const workOrder = await getAuthorizedWorkOrder(input.workOrderId);
    // Check every file's real contents before storing any, so one bad file doesn't leave a partial batch.
    const photoTypes: string[] = [];
    for (const file of files) {
      const photoType = await detectPhotoType(Buffer.from(await file.arrayBuffer()));
      if (!photoType) {
        throw new UserFacingError(`${safeFileName(file, "A file")} isn't a supported photo. Upload ${supportedPhotoDescription} images.`);
      }
      photoTypes.push(photoType);
    }
    for (const [index, file] of files.entries()) {
      const photoType = photoTypes[index];
      const source = Buffer.from(await file.arrayBuffer());
      const image = sharp(source);
      const [optimized, thumbnail] = await Promise.all([
        image.clone().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
        image.clone().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
      ]);
      const storageKey = storageKeyPrefix(input.workOrderId);
      const keys = { original: `${storageKey}/original`, optimized: `${storageKey}/optimized.webp`, thumbnail: `${storageKey}/thumbnail.webp` };
      const stored = await Promise.all([
        storePrivateBuffer({ key: keys.original, content: source, contentType: photoType }),
        storePrivateBuffer({ key: keys.optimized, content: optimized, contentType: "image/webp" }),
        storePrivateBuffer({ key: keys.thumbnail, content: thumbnail, contentType: "image/webp" }),
      ]);
      if (stored.some((result) => !result)) {
        await discardStoredFiles(Object.values(keys));
        throw new UserFacingError("Private file storage is not configured.");
      }
      try {
        await prisma.$transaction(async (transaction) => {
          const attachment = await transaction.attachment.create({
            data: {
              workOrderId: input.workOrderId,
              equipmentId: workOrder.equipmentId,
              serviceStageId: workOrder.serviceStageId,
              kind: "PHOTO",
              visibility: "CUSTOMER_VISIBLE",
              photoCategory: input.photoCategory,
              originalStorageKey: keys.original,
              optimizedStorageKey: keys.optimized,
              thumbnailStorageKey: keys.thumbnail,
              fileName: safeFileName(file, "photo"),
              mimeType: photoType,
              sizeBytes: file.size,
              uploadedById: internalUser.id,
            },
          });
          await recordAudit(transaction, {
            workOrderId: input.workOrderId,
            actorUserId: internalUser.id,
            eventType: "photo.uploaded",
            entityType: "Attachment",
            entityId: attachment.id,
            customerVisible: true,
            metadata: { photoCategory: input.photoCategory, bulkUpload: true },
          });
        });
      } catch (error) {
        await discardStoredFiles(Object.values(keys));
        throw error;
      }
    }
    revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
    revalidatePath(`/portal/work-orders/${input.workOrderId}`);
    revalidatePath("/portal");
    return `${files.length} photo${files.length === 1 ? "" : "s"} uploaded.`;
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
      });
    } catch (error) {
      await discardStoredFiles([originalKey]);
      throw error;
    }
    revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
  });
}
