"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUserForRoles } from "@/services/authorization";
import { deletePrivateFile } from "@/services/private-storage";

const requiredText = z.string().trim().min(1);

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

async function assertNotLastActiveAdministrator(transaction: Prisma.TransactionClient, userId: string) {
  const remainingAdministrators = await transaction.user.count({
    where: {
      id: { not: userId },
      isActive: true,
      internalRole: UserRole.PORTAL_ADMINISTRATOR,
    },
  });
  if (remainingAdministrators === 0) {
    throw new Error("At least one active portal administrator is required.");
  }
}

export async function updateUserActiveStatus(formData: FormData) {
  const input = z.object({ userId: requiredText, isActive: z.enum(["true", "false"]) }).parse({
    userId: value(formData, "userId"),
    isActive: value(formData, "isActive"),
  });
  const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  if (input.userId === reviewer.id) {
    throw new Error("You cannot change your own access status.");
  }

  const isActive = input.isActive === "true";
  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true, internalRole: true },
    });
    if (!user) throw new Error("User not found.");
    if (!isActive && user.isActive && user.internalRole === UserRole.PORTAL_ADMINISTRATOR) {
      await assertNotLastActiveAdministrator(transaction, user.id);
    }
    await transaction.user.update({ where: { id: user.id }, data: { isActive } });
    await transaction.auditEvent.create({
      data: {
        actorUserId: reviewer.id,
        eventType: isActive ? "user.enabled" : "user.disabled",
        entityType: "User",
        entityId: user.id,
        metadata: { previousIsActive: user.isActive },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath("/workspace/users");
  revalidatePath("/workspace");
}

export async function updateInternalUserRole(formData: FormData) {
  const input = z.object({ userId: requiredText, internalRole: z.enum(["PORTAL_ADMINISTRATOR", "VACTECH_MANAGER", "VACTECH_SERVICE_USER"]) }).parse({
    userId: value(formData, "userId"),
    internalRole: value(formData, "internalRole"),
  });
  const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  if (input.userId === reviewer.id) throw new Error("You cannot change your own role.");
  if (input.internalRole === UserRole.PORTAL_ADMINISTRATOR) {
    await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR]);
  }
  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true, internalRole: true },
    });
    if (!user?.internalRole) throw new Error("Internal user not found.");
    if (user.internalRole === input.internalRole) return;
    if (user.isActive && user.internalRole === UserRole.PORTAL_ADMINISTRATOR) {
      await assertNotLastActiveAdministrator(transaction, user.id);
    }
    await transaction.user.update({ where: { id: user.id }, data: { internalRole: input.internalRole } });
    await transaction.auditEvent.create({ data: { actorUserId: reviewer.id, eventType: "user.internal-role-changed", entityType: "User", entityId: user.id, metadata: { previousRole: user.internalRole, internalRole: input.internalRole } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath("/workspace/users");
}

export async function grantUserAccess(formData: FormData) {
  const input = z.object({ userId: requiredText, companyId: requiredText, locationId: z.string().trim() }).parse({
    userId: value(formData, "userId"),
    companyId: value(formData, "companyId"),
    locationId: value(formData, "locationId"),
  });
  const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new Error("User not found.");
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true } });
  if (!company) throw new Error("Company not found.");
  if (input.locationId) {
    const location = await prisma.location.findFirst({ where: { id: input.locationId, companyId: company.id }, select: { id: true } });
    if (!location) throw new Error("Location does not belong to the selected company.");
  }
  const scope = input.locationId ? "LOCATION" : "COMPANY";
  const existingAccess = await prisma.userAccess.findFirst({
    where: {
      userId: user.id,
      companyId: company.id,
      locationId: input.locationId || null,
      role: UserRole.CUSTOMER_USER,
      scope,
    },
    select: { id: true },
  });
  if (existingAccess) return;
  const access = await prisma.userAccess.create({
    data: { userId: user.id, companyId: company.id, locationId: input.locationId || null, role: "CUSTOMER_USER", scope },
  });
  await prisma.auditEvent.create({ data: { actorUserId: reviewer.id, eventType: "user-access.granted", entityType: "UserAccess", entityId: access.id, metadata: { userId: user.id, companyId: company.id, locationId: input.locationId || null } } });
  revalidatePath("/workspace/users");
}

export async function revokeUserAccess(formData: FormData) {
  const accessId = requiredText.parse(value(formData, "accessId"));
  const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const access = await prisma.userAccess.findUnique({ where: { id: accessId }, select: { id: true, userId: true, companyId: true, locationId: true } });
  if (!access) throw new Error("Access grant not found.");
  await prisma.$transaction([
    prisma.userAccess.delete({ where: { id: access.id } }),
    prisma.auditEvent.create({ data: { actorUserId: reviewer.id, eventType: "user-access.revoked", entityType: "UserAccess", entityId: access.id, metadata: { userId: access.userId, companyId: access.companyId, locationId: access.locationId } } }),
  ]);
  revalidatePath("/workspace/users");
}

export async function updateDocumentVisibility(formData: FormData) {
  const input = z.object({ attachmentId: requiredText, visibility: z.enum(["INTERNAL_ONLY", "CUSTOMER_VISIBLE"]) }).parse({
    attachmentId: value(formData, "attachmentId"),
    visibility: value(formData, "visibility"),
  });
  const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const attachment = await prisma.attachment.findFirst({
    where: { id: input.attachmentId, kind: "DOCUMENT" },
    select: { id: true, workOrderId: true, visibility: true },
  });
  if (!attachment) throw new Error("Document not found.");
  if (attachment.visibility === input.visibility) return;
  await prisma.$transaction([
    prisma.attachment.update({ where: { id: attachment.id }, data: { visibility: input.visibility } }),
    prisma.auditEvent.create({ data: { actorUserId: reviewer.id, workOrderId: attachment.workOrderId, eventType: "document.visibility-changed", entityType: "Attachment", entityId: attachment.id, customerVisible: input.visibility === "CUSTOMER_VISIBLE", metadata: { previousVisibility: attachment.visibility, visibility: input.visibility } } }),
  ]);
  revalidatePath(`/workspace/work-orders/${attachment.workOrderId}`);
  revalidatePath(`/portal/work-orders/${attachment.workOrderId}`);
}

export async function updateServiceStage(formData: FormData) {
  const input = z.object({
    serviceStageId: requiredText,
    customerFacingStatus: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED"]),
    isActive: z.enum(["true", "false"]),
  }).parse({
    serviceStageId: value(formData, "serviceStageId"),
    customerFacingStatus: value(formData, "customerFacingStatus"),
    isActive: value(formData, "isActive"),
  });
  const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const stage = await prisma.serviceStage.findUnique({
    where: { id: input.serviceStageId },
    select: { id: true, customerFacingStatus: true, isActive: true },
  });
  if (!stage) throw new Error("Service stage not found.");
  const isActive = input.isActive === "true";
  if (stage.customerFacingStatus === input.customerFacingStatus && stage.isActive === isActive) return;
  await prisma.$transaction([
    prisma.serviceStage.update({
      where: { id: stage.id },
      data: { customerFacingStatus: input.customerFacingStatus, isActive },
    }),
    prisma.auditEvent.create({
      data: {
        actorUserId: reviewer.id,
        eventType: "service-stage.updated",
        entityType: "ServiceStage",
        entityId: stage.id,
        metadata: { previousCustomerFacingStatus: stage.customerFacingStatus, customerFacingStatus: input.customerFacingStatus, previousIsActive: stage.isActive, isActive },
      },
    }),
  ]);
  revalidatePath("/workspace/workflow");
  revalidatePath("/workspace/work-orders");
}

export async function deleteDocument(formData: FormData) {
  const attachmentId = requiredText.parse(value(formData, "attachmentId"));
  const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, kind: "DOCUMENT" },
    select: { id: true, workOrderId: true, originalStorageKey: true, optimizedStorageKey: true, thumbnailStorageKey: true },
  });
  if (!attachment) throw new Error("Document not found.");

  const storageKeys = [attachment.originalStorageKey, attachment.optimizedStorageKey, attachment.thumbnailStorageKey].filter((key): key is string => Boolean(key));
  const deletionResults = await Promise.all(storageKeys.map((key) => deletePrivateFile(key)));
  if (deletionResults.some((deleted) => !deleted)) {
    throw new Error("Private file storage is not configured; document was not deleted.");
  }

  await prisma.$transaction([
    prisma.attachment.delete({ where: { id: attachment.id } }),
    prisma.auditEvent.create({ data: { actorUserId: reviewer.id, workOrderId: attachment.workOrderId, eventType: "document.deleted", entityType: "Attachment", entityId: attachment.id } }),
  ]);
  revalidatePath(`/workspace/work-orders/${attachment.workOrderId}`);
  revalidatePath(`/portal/work-orders/${attachment.workOrderId}`);
}
