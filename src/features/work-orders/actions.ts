"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { findOrCreateProductModel, modelDisplayName } from "@/features/work-orders/intake";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser, getActiveInternalUserForRoles, getAuthorizedWorkOrder } from "@/services/authorization";
import { detectDocumentType, detectPhotoType, supportedDocumentDescription, supportedPhotoDescription } from "@/services/file-types";
import { deletePrivateFile, storePrivateBuffer } from "@/services/private-storage";
import { logCustomerNotification, statusChangeNotification } from "@/services/notifications";

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
      })
      .parse({
        workOrderId: value(formData, "workOrderId"),
        serviceStageId: value(formData, "serviceStageId"),
        condition: value(formData, "condition"),
        note: value(formData, "note"),
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
        select: { companyId: true, workOrderNumber: true, serviceStageId: true, condition: true, customerFacingStatus: true, completedAt: true },
      });
      if (workOrder.serviceStageId === stage.id && workOrder.condition === input.condition) {
        return false;
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
          note: input.note,
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
      return true;
    });

    revalidatePath("/workspace");
    revalidatePath("/portal");
    revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
    return changed ? "Service state updated." : "The stage and condition are unchanged. Use a note to add information.";
  });
}

export async function uploadWorkOrderPhotos(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({ workOrderId: requiredText, photoCategory: photoCategorySchema, visibility: z.enum(["INTERNAL_ONLY", "CUSTOMER_VISIBLE"]) })
      .parse({
        workOrderId: value(formData, "workOrderId"),
        photoCategory: value(formData, "photoCategory"),
        visibility: value(formData, "visibility") || "CUSTOMER_VISIBLE",
      });
    // The form has separate camera and library inputs; the unused one arrives as an empty file.
    const files = formData.getAll("files").filter((file): file is File => file instanceof File && (file.size > 0 || file.name !== ""));
    if (!files.length) {
      throw new UserFacingError("Choose at least one photo.");
    }
    const empty = files.find((file) => file.size === 0);
    if (empty) {
      throw new UserFacingError(`${safeFileName(empty, "A photo")} is empty.`);
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
              visibility: input.visibility,
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
            customerVisible: input.visibility === "CUSTOMER_VISIBLE",
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
