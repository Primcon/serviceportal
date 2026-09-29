"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUserForRoles } from "@/services/authorization";
import { displayNameForPerson, normalizeNamePart } from "@/services/person-name";

const requiredText = z.string().trim().min(1);

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

export async function createAccessRequest(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({
        firstName: requiredText,
        lastName: requiredText,
        email: z.string().trim().email("Enter a valid email address."),
        requestedCompany: requiredText,
        message: z.string().trim(),
      })
      .parse({
        firstName: value(formData, "firstName"),
        lastName: value(formData, "lastName"),
        email: value(formData, "email").toLowerCase(),
        requestedCompany: value(formData, "requestedCompany"),
        message: value(formData, "message"),
      });

    await prisma.accessRequest.create({
      data: {
        ...input,
        name: displayNameForPerson(input.firstName, input.lastName, input.email),
        message: input.message || null,
      },
    });
    revalidatePath("/access-request");
    revalidatePath("/workspace");
  });
}

export async function approveAccessRequest(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z
      .object({ requestId: requiredText, companyId: requiredText })
      .parse({ requestId: value(formData, "requestId"), companyId: value(formData, "companyId") });
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);

    await prisma.$transaction(async (transaction) => {
      const request = await transaction.accessRequest.findFirst({
        where: { id: input.requestId, status: "PENDING" },
      });
      if (!request) throw new UserFacingError("Pending access request not found.");
      const company = await transaction.company.findUnique({ where: { id: input.companyId } });
      if (!company) throw new UserFacingError("Company not found.");
      const firstName = normalizeNamePart(request.firstName);
      const lastName = normalizeNamePart(request.lastName);
      const displayName = firstName || lastName ? displayNameForPerson(firstName, lastName, request.email) : request.name;

      const user = await transaction.user.upsert({
        where: { email: request.email },
        update: { displayName, ...(firstName || lastName ? { firstName, lastName } : {}) },
        create: {
          identitySubject: `customer:${request.email}`,
          email: request.email,
          displayName,
          firstName,
          lastName,
        },
      });
      const existingAccess = await transaction.userAccess.findFirst({
        where: { userId: user.id, companyId: company.id, role: "CUSTOMER_USER" },
      });
      if (!existingAccess) {
        await transaction.userAccess.create({
          data: { userId: user.id, companyId: company.id, role: "CUSTOMER_USER" },
        });
      }
      await transaction.accessRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", assignedCompanyId: company.id, reviewedById: reviewer.id, reviewedAt: new Date() },
      });
      await recordAudit(transaction, {
        actorUserId: reviewer.id,
        eventType: "access-request.approved",
        entityType: "AccessRequest",
        entityId: request.id,
        metadata: { companyId: company.id, userId: user.id },
      });
    });
    revalidatePath("/workspace");
    revalidatePath("/workspace/access-requests");
  });
}

export async function rejectAccessRequest(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const requestId = requiredText.parse(value(formData, "requestId"));
    const reviewer = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);

    await prisma.$transaction(async (transaction) => {
      const request = await transaction.accessRequest.findFirst({ where: { id: requestId, status: "PENDING" } });
      if (!request) throw new UserFacingError("Pending access request not found.");
      await transaction.accessRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", reviewedById: reviewer.id, reviewedAt: new Date() },
      });
      await recordAudit(transaction, {
        actorUserId: reviewer.id,
        eventType: "access-request.rejected",
        entityType: "AccessRequest",
        entityId: request.id,
      });
    });
    revalidatePath("/workspace");
    revalidatePath("/workspace/access-requests");
  });
}
