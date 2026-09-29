"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser, getActiveInternalUserForRoles, getAuthorizedWorkOrder } from "@/services/authorization";
import { storePrivateBuffer, storePrivateFile, storePrivatePhoto } from "@/services/private-storage";
import { logCustomerNotification } from "@/services/notifications";
import { ensureInitialStages } from "./initial-stages";

const requiredText = z.string().trim().min(1);

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function uploadedFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A photo is required.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded as photos.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Photos must be 10 MB or smaller.");
  }
  return file;
}

export async function createCompany(formData: FormData) {
  const input = z.object({ name: requiredText }).parse({ name: value(formData, "name") });
  const internalUser = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);

  const company = await prisma.company.create({ data: { name: input.name } });
  await prisma.auditEvent.create({
    data: {
      actorUserId: internalUser.id,
      eventType: "company.created",
      entityType: "Company",
      entityId: company.id,
    },
  });
  revalidatePath("/workspace");
  revalidatePath("/portal");
}

export async function createLocation(formData: FormData) {
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
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true } });
  if (!company) throw new Error("Company not found.");
  const location = await prisma.location.create({
    data: {
      ...input,
      addressLine: input.addressLine || null,
      city: input.city || null,
      region: input.region || null,
      postalCode: input.postalCode || null,
      country: input.country || null,
    },
  });
  await prisma.auditEvent.create({ data: { actorUserId: internalUser.id, eventType: "location.created", entityType: "Location", entityId: location.id, metadata: { companyId: company.id } } });
  revalidatePath("/workspace");
}

export async function createEquipment(formData: FormData) {
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
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true } });
  if (!company) {
    throw new Error("Company not found.");
  }
  if (input.locationId) {
    const location = await prisma.location.findFirst({ where: { id: input.locationId, companyId: input.companyId }, select: { id: true } });
    if (!location) throw new Error("Location does not belong to the selected company.");
  }
  const existingEquipment = await prisma.equipment.findFirst({
    where: {
      companyId: company.id,
      serialNumber: { equals: input.serialNumber, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existingEquipment) {
    throw new Error("Equipment with this serial number already exists for the selected company.");
  }
  const equipment = await prisma.equipment.create({
    data: {
      ...input,
      companyId: company.id,
      locationId: input.locationId || null,
      description: input.description || null,
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorUserId: internalUser.id,
      eventType: "equipment.created",
      entityType: "Equipment",
      entityId: equipment.id,
    },
  });
  revalidatePath("/workspace");
}

export async function createWorkOrder(formData: FormData) {
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
  const [equipment, receivedStage] = await Promise.all([
    prisma.equipment.findUniqueOrThrow({ where: { id: input.equipmentId } }),
    ensureInitialStages(prisma),
  ]);
  const workOrder = await prisma.workOrder.create({
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
  await prisma.workOrderStatusHistory.create({
    data: {
      workOrderId: workOrder.id,
      serviceStageId: receivedStage.id,
      condition: workOrder.condition,
      changedById: internalUser.id,
    },
  });
  await prisma.auditEvent.create({
    data: {
      workOrderId: workOrder.id,
      actorUserId: internalUser.id,
      eventType: "work-order.created",
      entityType: "WorkOrder",
      entityId: workOrder.id,
      customerVisible: true,
    },
  });
  revalidatePath("/workspace");
  revalidatePath("/portal");
}

export async function createCustomerVisibleUpdate(formData: FormData) {
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
  const update = await prisma.serviceUpdate.create({
    data: {
      workOrderId: input.workOrderId,
      title: input.title,
      body: input.body,
      visibility: "CUSTOMER_VISIBLE",
      notifyCustomer: input.notifyCustomer,
      createdById: internalUser.id,
    },
  });
  await prisma.auditEvent.create({
    data: {
      workOrderId: input.workOrderId,
      actorUserId: internalUser.id,
      eventType: "service-update.posted",
      entityType: "ServiceUpdate",
      entityId: update.id,
      customerVisible: true,
    },
  });
  if (input.notifyCustomer) {
    await logCustomerNotification(prisma, {
      companyId: workOrder.companyId,
      workOrderId: input.workOrderId,
      serviceUpdateId: update.id,
    });
  }
  revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
  revalidatePath(`/portal/work-orders/${input.workOrderId}`);
  revalidatePath("/portal/notifications");
  revalidatePath("/workspace");
  revalidatePath("/portal");
}

export async function updateWorkOrderStatus(formData: FormData) {
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
  const stage = await prisma.serviceStage.findUniqueOrThrow({
    where: { id: input.serviceStageId },
  });
  if (!stage.isActive) {
    throw new Error("Service stage is inactive.");
  }

  await prisma.$transaction(async (transaction) => {
    const workOrder = await transaction.workOrder.findUniqueOrThrow({
      where: { id: input.workOrderId },
      select: { companyId: true, workOrderNumber: true, serviceStageId: true, condition: true },
    });
    if (workOrder.serviceStageId === stage.id && workOrder.condition === input.condition) {
      return;
    }
    await transaction.workOrder.update({
      where: { id: input.workOrderId },
      data: {
        serviceStageId: stage.id,
        customerFacingStatus: stage.customerFacingStatus,
        condition: input.condition,
        completedAt: stage.code === "COMPLETED" ? new Date() : null,
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
    await transaction.auditEvent.create({
      data: {
        workOrderId: input.workOrderId,
        actorUserId: internalUser.id,
        eventType: "work-order.status-changed",
        entityType: "WorkOrder",
        entityId: input.workOrderId,
        customerVisible: true,
      },
    });
    await logCustomerNotification(transaction, {
      companyId: workOrder.companyId,
      workOrderId: input.workOrderId,
      eventKey: `status-change:${statusHistory.id}`,
      subject: `Service status changed: ${stage.customerFacingStatus.replaceAll("_", " ")}`,
      body: `Your repair ${workOrder.workOrderNumber} is now ${stage.customerFacingStatus.replaceAll("_", " ")} (${input.condition.replaceAll("_", " ")}).`,
    });
  });

  revalidatePath("/workspace");
  revalidatePath("/portal");
}

export async function createInternalFinding(formData: FormData) {
  const input = z
    .object({ workOrderId: requiredText, title: requiredText, body: requiredText })
    .parse({
      workOrderId: value(formData, "workOrderId"),
      title: value(formData, "title"),
      body: value(formData, "body"),
    });
  const internalUser = await getActiveInternalUser();
  await getAuthorizedWorkOrder(input.workOrderId);
  const finding = await prisma.finding.create({
    data: {
      ...input,
      createdById: internalUser.id,
    },
  });
  await prisma.auditEvent.create({
    data: {
      workOrderId: input.workOrderId,
      actorUserId: internalUser.id,
      eventType: "finding.created",
      entityType: "Finding",
      entityId: finding.id,
    },
  });
  revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
  revalidatePath("/workspace");
}

export async function createCustomerVisiblePhoto(formData: FormData) {
  const input = z
    .object({
      workOrderId: requiredText,
      photoCategory: z.enum([
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
      ]),
    })
    .parse({
      workOrderId: value(formData, "workOrderId"),
      photoCategory: value(formData, "photoCategory"),
    });
  const file = uploadedFile(formData);
  const internalUser = await getActiveInternalUser();
  const workOrder = await getAuthorizedWorkOrder(input.workOrderId);
  const storageKey = `development/work-orders/${input.workOrderId}/${crypto.randomUUID()}`;
  const fileName = file.name.split(/[\\/]/).pop() || "photo";
  const stored = await storePrivatePhoto({ key: `${storageKey}/original`, file });
  if (!stored) {
    throw new Error("Private file storage is not configured.");
  }
  const attachment = await prisma.attachment.create({
    data: {
      workOrderId: input.workOrderId,
      equipmentId: workOrder.equipmentId,
      serviceStageId: workOrder.serviceStageId,
      kind: "PHOTO",
      visibility: "CUSTOMER_VISIBLE",
      photoCategory: input.photoCategory,
      originalStorageKey: `${storageKey}/original`,
      thumbnailStorageKey: `${storageKey}/thumbnail`,
      fileName,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: internalUser.id,
    },
  });
  await prisma.auditEvent.create({
    data: {
      workOrderId: input.workOrderId,
      actorUserId: internalUser.id,
      eventType: "photo.uploaded",
      entityType: "Attachment",
      entityId: attachment.id,
      customerVisible: true,
    },
  });
  revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
  revalidatePath(`/portal/work-orders/${input.workOrderId}`);
  revalidatePath("/portal");
}

export async function createCustomerVisiblePhotos(formData: FormData) {
  const input = z
    .object({
      workOrderId: requiredText,
      photoCategory: z.enum([
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
      ]),
    })
    .parse({
      workOrderId: value(formData, "workOrderId"),
      photoCategory: value(formData, "photoCategory"),
    });
  const fileEntries = formData.getAll("files");
  const files = fileEntries.filter((file): file is File => file instanceof File);
  if (!files.length || files.length !== fileEntries.length || files.some((file) => file.size === 0)) {
    throw new Error("At least one photo is required.");
  }
  if (files.length > 20) {
    throw new Error("Upload up to 20 photos at a time.");
  }
  if (files.some((file) => !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)) {
    throw new Error("Photos must be images no larger than 10 MB.");
  }

  const internalUser = await getActiveInternalUser();
  const workOrder = await getAuthorizedWorkOrder(input.workOrderId);
  for (const file of files) {
    const source = Buffer.from(await file.arrayBuffer());
    const image = sharp(source);
    const [optimized, thumbnail] = await Promise.all([
      image.clone().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      image.clone().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
    ]);
    const storageKey = `development/work-orders/${input.workOrderId}/${crypto.randomUUID()}`;
    const fileName = file.name.split(/[\\/]/).pop() || "photo";
    const stored = await Promise.all([
      storePrivateBuffer({ key: `${storageKey}/original`, content: source, contentType: file.type }),
      storePrivateBuffer({ key: `${storageKey}/optimized.webp`, content: optimized, contentType: "image/webp" }),
      storePrivateBuffer({ key: `${storageKey}/thumbnail.webp`, content: thumbnail, contentType: "image/webp" }),
    ]);
    if (stored.some((result) => !result)) {
      throw new Error("Private file storage is not configured.");
    }
    const attachment = await prisma.attachment.create({
      data: {
        workOrderId: input.workOrderId,
        equipmentId: workOrder.equipmentId,
        serviceStageId: workOrder.serviceStageId,
        kind: "PHOTO",
        visibility: "CUSTOMER_VISIBLE",
        photoCategory: input.photoCategory,
        originalStorageKey: `${storageKey}/original`,
        optimizedStorageKey: `${storageKey}/optimized.webp`,
        thumbnailStorageKey: `${storageKey}/thumbnail.webp`,
        fileName,
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedById: internalUser.id,
      },
    });
    await prisma.auditEvent.create({
      data: {
        workOrderId: input.workOrderId,
        actorUserId: internalUser.id,
        eventType: "photo.uploaded",
        entityType: "Attachment",
        entityId: attachment.id,
        customerVisible: true,
        metadata: { photoCategory: input.photoCategory, bulkUpload: true },
      },
    });
  }
  revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
  revalidatePath(`/portal/work-orders/${input.workOrderId}`);
  revalidatePath("/portal");
}

function uploadedDocument(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A document is required.");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Documents must be 25 MB or smaller.");
  }
  return file;
}

export async function createInternalDocument(formData: FormData) {
  const input = z
    .object({
      workOrderId: requiredText,
      documentType: z.enum([
        "CUSTOMER_PO",
        "REPAIR_QUOTE",
        "INSPECTION_REPORT",
        "TEST_REPORT",
        "FINAL_SERVICE_REPORT",
        "SHIPPING_DOCUMENTATION",
        "OTHER",
      ]),
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
  const storageKey = `development/work-orders/${input.workOrderId}/${crypto.randomUUID()}`;
  const fileName = file.name.split(/[\\/]/).pop() || "document";
  const stored = await storePrivateFile({ key: `${storageKey}/original`, file });
  if (!stored) {
    throw new Error("Private file storage is not configured.");
  }
  const attachment = await prisma.attachment.create({
    data: {
      workOrderId: input.workOrderId,
      equipmentId: workOrder.equipmentId,
      serviceStageId: workOrder.serviceStageId,
      kind: "DOCUMENT",
      visibility: input.visibility,
      documentType: input.documentType,
      originalStorageKey: `${storageKey}/original`,
      fileName,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      uploadedById: internalUser.id,
    },
  });
  await prisma.auditEvent.create({
    data: {
      workOrderId: input.workOrderId,
      actorUserId: internalUser.id,
      eventType: "document.uploaded",
      entityType: "Attachment",
      entityId: attachment.id,
      customerVisible: input.visibility === "CUSTOMER_VISIBLE",
    },
  });
  revalidatePath(`/workspace/work-orders/${input.workOrderId}`);
}