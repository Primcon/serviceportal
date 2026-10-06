"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { AccessDeniedError, UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { notifyDocumentShared } from "@/features/work-orders/document-notification";
import { recordAudit } from "@/services/audit";
import { isPlaceholderIdentity, relinkIdentityPrefix } from "@/services/identity-linking";
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
    throw new UserFacingError("At least one active portal administrator is required.");
  }
}

/** Managers administer staff and customers, but only a portal administrator can change another administrator. */
function assertMayManage(reviewerRole: UserRole, targetRole: UserRole | null) {
  if (targetRole === UserRole.PORTAL_ADMINISTRATOR && reviewerRole !== UserRole.PORTAL_ADMINISTRATOR) {
    throw new AccessDeniedError("Only a portal administrator can change another administrator's access.");
  }
}

export async function updateUserActiveStatus(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ userId: requiredText, isActive: z.enum(["true", "false"]) }).parse({
      userId: value(formData, "userId"),
      isActive: value(formData, "isActive"),
    });
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
    if (input.userId === reviewer.id) {
      throw new UserFacingError("You cannot change your own access status.");
    }

    const isActive = input.isActive === "true";
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: input.userId },
        select: { id: true, isActive: true, internalRole: true },
      });
      if (!user) throw new UserFacingError("User not found.");
      assertMayManage(reviewer.internalRole, user.internalRole);
      if (!isActive && user.isActive && user.internalRole === UserRole.PORTAL_ADMINISTRATOR) {
        await assertNotLastActiveAdministrator(transaction, user.id);
      }
      await transaction.user.update({ where: { id: user.id }, data: { isActive } });
      await recordAudit(transaction, {
        actorUserId: reviewer.id,
        eventType: isActive ? "user.enabled" : "user.disabled",
        entityType: "User",
        entityId: user.id,
        metadata: { previousIsActive: user.isActive },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidatePath("/workspace/users");
    revalidatePath("/workspace");
  });
}

export async function updateInternalUserRole(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ userId: requiredText, internalRole: z.enum(["PORTAL_ADMINISTRATOR", "VACTECH_MANAGER", "VACTECH_QA", "VACTECH_SERVICE_USER"]) }).parse({
      userId: value(formData, "userId"),
      internalRole: value(formData, "internalRole"),
    });
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
    if (input.userId === reviewer.id) throw new UserFacingError("You cannot change your own role.");
    if (input.internalRole === UserRole.PORTAL_ADMINISTRATOR) {
      await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR]);
    }
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: input.userId },
        select: { id: true, isActive: true, internalRole: true },
      });
      if (!user?.internalRole) throw new UserFacingError("Internal user not found.");
      assertMayManage(reviewer.internalRole, user.internalRole);
      if (user.internalRole === input.internalRole) return;
      if (user.isActive && user.internalRole === UserRole.PORTAL_ADMINISTRATOR) {
        await assertNotLastActiveAdministrator(transaction, user.id);
      }
      await transaction.user.update({ where: { id: user.id }, data: { internalRole: input.internalRole } });
      await recordAudit(transaction, { actorUserId: reviewer.id, eventType: "user.internal-role-changed", entityType: "User", entityId: user.id, metadata: { previousRole: user.internalRole, internalRole: input.internalRole } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidatePath("/workspace/users");
  });
}

/**
 * Lets a person link their account again at their next sign-in. For someone whose sign-in
 * was recreated (so it no longer matches the one on record): their account, access and
 * history stay, and the next sign-in with their email address is accepted.
 */
export async function resetSignInLink(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const userId = requiredText.parse(value(formData, "userId"));
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id: userId }, select: { id: true, internalRole: true, identitySubject: true } });
      if (!user) throw new UserFacingError("User not found.");
      assertMayManage(reviewer.internalRole, user.internalRole);
      if (user.id === reviewer.id) throw new UserFacingError("You can't reset your own sign-in link.");
      if (isPlaceholderIdentity(user.identitySubject)) throw new UserFacingError("This account is already waiting for its next sign-in.");
      await transaction.user.update({ where: { id: user.id }, data: { identitySubject: `${relinkIdentityPrefix}${crypto.randomUUID()}` } });
      await recordAudit(transaction, { actorUserId: reviewer.id, eventType: "user.sign-in-link-reset", entityType: "User", entityId: user.id });
    });
    revalidatePath("/workspace/users");
    return "Done. Their next sign-in with this email address will be linked to this account.";
  });
}

export async function grantUserAccess(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ userId: requiredText, companyId: requiredText, locationId: z.string().trim() }).parse({
      userId: value(formData, "userId"),
      companyId: value(formData, "companyId"),
      locationId: value(formData, "locationId"),
    });
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
    const granted = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id: input.userId }, select: { id: true } });
      if (!user) throw new UserFacingError("User not found.");
      const company = await transaction.company.findUnique({ where: { id: input.companyId }, select: { id: true } });
      if (!company) throw new UserFacingError("Company not found.");
      if (input.locationId) {
        const location = await transaction.location.findFirst({ where: { id: input.locationId, companyId: company.id }, select: { id: true } });
        if (!location) throw new UserFacingError("Location does not belong to the selected company.");
      }
      const scope = input.locationId ? "LOCATION" : "COMPANY";
      const existingAccess = await transaction.userAccess.findFirst({
        where: {
          userId: user.id,
          companyId: company.id,
          locationId: input.locationId || null,
          role: UserRole.CUSTOMER_USER,
          scope,
        },
        select: { id: true },
      });
      if (existingAccess) return false;
      const access = await transaction.userAccess.create({
        data: { userId: user.id, companyId: company.id, locationId: input.locationId || null, role: "CUSTOMER_USER", scope },
      });
      await recordAudit(transaction, { actorUserId: reviewer.id, eventType: "user-access.granted", entityType: "UserAccess", entityId: access.id, metadata: { userId: user.id, companyId: company.id, locationId: input.locationId || null } });
      return true;
    });
    revalidatePath("/workspace/users");
    return granted ? undefined : "This user already has that access.";
  });
}

export async function revokeUserAccess(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const accessId = requiredText.parse(value(formData, "accessId"));
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
    await prisma.$transaction(async (transaction) => {
      const access = await transaction.userAccess.findUnique({ where: { id: accessId }, select: { id: true, userId: true, companyId: true, locationId: true } });
      if (!access) throw new UserFacingError("Access grant not found.");
      await transaction.userAccess.delete({ where: { id: access.id } });
      await recordAudit(transaction, { actorUserId: reviewer.id, eventType: "user-access.revoked", entityType: "UserAccess", entityId: access.id, metadata: { userId: access.userId, companyId: access.companyId, locationId: access.locationId } });
    });
    revalidatePath("/workspace/users");
  });
}

export async function updateDocumentVisibility(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ attachmentId: requiredText, visibility: z.enum(["INTERNAL_ONLY", "CUSTOMER_VISIBLE"]) }).parse({
      attachmentId: value(formData, "attachmentId"),
      visibility: value(formData, "visibility"),
    });
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
    const workOrderId = await prisma.$transaction(async (transaction) => {
      const attachment = await transaction.attachment.findFirst({
        where: { id: input.attachmentId, kind: "DOCUMENT" },
        select: { id: true, workOrderId: true, visibility: true, documentType: true, fileName: true },
      });
      if (!attachment) throw new UserFacingError("Document not found.");
      if (attachment.visibility === input.visibility) return attachment.workOrderId;
      await transaction.attachment.update({ where: { id: attachment.id }, data: { visibility: input.visibility } });
      if (input.visibility === "CUSTOMER_VISIBLE") await notifyDocumentShared(transaction, attachment);
      await recordAudit(transaction, { actorUserId: reviewer.id, workOrderId: attachment.workOrderId, eventType: "document.visibility-changed", entityType: "Attachment", entityId: attachment.id, customerVisible: input.visibility === "CUSTOMER_VISIBLE", metadata: { previousVisibility: attachment.visibility, visibility: input.visibility } });
      return attachment.workOrderId;
    });
    revalidatePath(`/workspace/work-orders/${workOrderId}`);
    revalidatePath(`/portal/work-orders/${workOrderId}`);
  });
}

export async function updateServiceStage(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      serviceStageId: requiredText,
      customerFacingStatus: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED"]),
      isActive: z.enum(["true", "false"]),
      // The step customers see for this stage. Left as it is when the form doesn't send it.
      customerLabel: z.string().trim().max(40).optional(),
    }).parse({
      serviceStageId: value(formData, "serviceStageId"),
      customerFacingStatus: value(formData, "customerFacingStatus"),
      isActive: value(formData, "isActive"),
      customerLabel: formData.has("customerLabel") ? value(formData, "customerLabel") : undefined,
    });
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
    const isActive = input.isActive === "true";
    await prisma.$transaction(async (transaction) => {
      const stage = await transaction.serviceStage.findUnique({
        where: { id: input.serviceStageId },
        select: { id: true, customerFacingStatus: true, isActive: true, customerLabel: true },
      });
      if (!stage) throw new UserFacingError("Service stage not found.");
      const customerLabel = input.customerLabel === undefined ? stage.customerLabel : input.customerLabel || null;
      if (stage.customerFacingStatus === input.customerFacingStatus && stage.isActive === isActive && stage.customerLabel === customerLabel) return;
      await transaction.serviceStage.update({
        where: { id: stage.id },
        data: { customerFacingStatus: input.customerFacingStatus, isActive, customerLabel },
      });
      // Work orders store their customer status for fast filtering, so keep jobs already
      // in this stage in step with the new mapping. This is a configuration change, so
      // customers aren't emailed about it.
      const resynchronized = stage.customerFacingStatus === input.customerFacingStatus
        ? { count: 0 }
        : await transaction.workOrder.updateMany({
          where: { serviceStageId: stage.id },
          data: { customerFacingStatus: input.customerFacingStatus },
        });
      await recordAudit(transaction, {
        actorUserId: reviewer.id,
        eventType: "service-stage.updated",
        entityType: "ServiceStage",
        entityId: stage.id,
        metadata: { previousCustomerFacingStatus: stage.customerFacingStatus, customerFacingStatus: input.customerFacingStatus, previousIsActive: stage.isActive, isActive, previousCustomerLabel: stage.customerLabel, customerLabel, workOrdersUpdated: resynchronized.count },
      });
    });
    revalidatePath("/workspace/workflow");
    revalidatePath("/workspace/work-orders");
    revalidatePath("/portal", "layout");
  });
}

export async function deleteDocument(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const attachmentId = requiredText.parse(value(formData, "attachmentId"));
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);

    // Remove the record first: a failed file deletion then leaves an unreferenced file,
    // never a document entry that points at a missing file.
    const attachment = await prisma.$transaction(async (transaction) => {
      const found = await transaction.attachment.findFirst({
        where: { id: attachmentId, kind: "DOCUMENT" },
        select: { id: true, workOrderId: true, fileName: true, originalStorageKey: true, optimizedStorageKey: true, thumbnailStorageKey: true },
      });
      if (!found) throw new UserFacingError("Document not found.");
      await transaction.attachment.delete({ where: { id: found.id } });
      await recordAudit(transaction, { actorUserId: reviewer.id, workOrderId: found.workOrderId, eventType: "document.deleted", entityType: "Attachment", entityId: found.id, metadata: { fileName: found.fileName } });
      return found;
    });

    const storageKeys = [attachment.originalStorageKey, attachment.optimizedStorageKey, attachment.thumbnailStorageKey].filter((key): key is string => Boolean(key));
    await Promise.all(storageKeys.map(async (key) => {
      try {
        await deletePrivateFile(key);
      } catch (error) {
        console.error("Deleted document's file could not be removed from storage.", { key, error });
      }
    }));
    revalidatePath(`/workspace/work-orders/${attachment.workOrderId}`);
    revalidatePath(`/portal/work-orders/${attachment.workOrderId}`);
  });
}
