"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { allowRequest } from "@/lib/rate-limit";
import { runAction } from "@/lib/run-action";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUserForRoles } from "@/services/authorization";
import { displayNameForPerson, normalizeNamePart } from "@/services/person-name";

const requiredText = z.string().trim().min(1);

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

const accessRequestReceived = "Request submitted. A VacTech team member will review it and contact you.";

async function requesterAddress() {
  const forwardedFor = (await headers()).get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export async function createAccessRequest(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    // Hidden field that people never see or fill in. Automated submissions usually do;
    // they get the normal confirmation so they learn nothing, and nothing is stored.
    if (value(formData, "website").trim()) return accessRequestReceived;
    if (!allowRequest(`access-request:${await requesterAddress()}`, 5, 15 * 60 * 1000)) {
      throw new UserFacingError("Too many requests from this network. Wait a few minutes and try again.");
    }

    const input = z
      .object({
        firstName: requiredText.max(100),
        lastName: requiredText.max(100),
        email: z.string().trim().max(254).email("Enter a valid email address."),
        requestedCompany: requiredText.max(200),
        message: z.string().trim().max(2000, "Keep the message under 2,000 characters."),
      })
      .parse({
        firstName: value(formData, "firstName"),
        lastName: value(formData, "lastName"),
        email: value(formData, "email").toLowerCase(),
        requestedCompany: value(formData, "requestedCompany"),
        message: value(formData, "message"),
      });

    // One pending request per address is enough to review, and a few per day is plenty.
    // Repeats get the same confirmation, so the form never reveals which addresses exist.
    const [pending, recent] = await Promise.all([
      prisma.accessRequest.count({ where: { email: input.email, status: "PENDING" } }),
      prisma.accessRequest.count({ where: { email: input.email, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);
    if (pending > 0 || recent >= 3) return accessRequestReceived;

    await prisma.accessRequest.create({
      data: {
        ...input,
        name: displayNameForPerson(input.firstName, input.lastName, input.email),
        message: input.message || null,
      },
    });
    revalidatePath("/access-request");
    revalidatePath("/workspace");
    return accessRequestReceived;
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
