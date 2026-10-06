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
import { invitedIdentityPrefix } from "@/services/identity-linking";
import { queueAccessEmail } from "@/services/notifications";
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

    await prisma.$transaction(async (transaction) => {
      const request = await transaction.accessRequest.create({
        data: {
          ...input,
          name: displayNameForPerson(input.firstName, input.lastName, input.email),
          message: input.message || null,
        },
      });
      // Tell the people who can approve it. Each gets one email per request.
      const reviewers = await transaction.user.findMany({ where: { isActive: true, internalRole: { in: [UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER] } }, select: { id: true, email: true } });
      for (const reviewer of reviewers) {
        await queueAccessEmail(transaction, {
          recipientEmail: reviewer.email,
          userId: reviewer.id,
          eventKey: `access-request:${request.id}`,
          subject: `Portal access requested by ${request.name}`,
          body: `${request.name} (${request.email}) has asked for customer portal access for ${request.requestedCompany}.${request.message ? `\n\nTheir message: ${request.message}` : ""}\n\nReview the request to approve or decline it.`,
          linkPath: "/workspace/access-requests",
        });
      }
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
      await queueAccessEmail(transaction, {
        recipientEmail: request.email,
        userId: user.id,
        eventKey: `access-approved:${request.id}`,
        subject: "Your VacTech service portal access is ready",
        body: `Hello ${displayName},\n\nYour request for access to ${company.name}'s repairs has been approved.\n\nSign in with this email address (${request.email}). The first time, you'll confirm the address with a one-time code and choose a password.`,
        linkPath: "/portal",
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
      await queueAccessEmail(transaction, {
        recipientEmail: request.email,
        eventKey: `access-declined:${request.id}`,
        subject: "About your VacTech service portal request",
        body: `Hello ${request.name},\n\nWe weren't able to approve your request for portal access for ${request.requestedCompany}. If you think this is a mistake, reply to your VacTech service contact and we'll look again.`,
      });
    });
    revalidatePath("/workspace");
    revalidatePath("/workspace/access-requests");
  });
}

/**
 * Invites someone to the customer portal directly, without an access request. Their account
 * and access are created now, and an email tells them how to sign in. The account is linked
 * to their sign-in the first time they use that email address.
 */
export async function inviteCustomerUser(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      companyId: z.string().uuid(),
      locationId: z.string().uuid().or(z.literal("")).transform((id) => id || null),
      firstName: requiredText.max(100),
      lastName: requiredText.max(100),
      email: z.string().trim().max(254).email("Enter a valid email address."),
    }).parse({
      companyId: value(formData, "companyId"),
      locationId: value(formData, "locationId"),
      firstName: value(formData, "firstName"),
      lastName: value(formData, "lastName"),
      email: value(formData, "email").toLowerCase(),
    });
    const inviter = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);

    await prisma.$transaction(async (transaction) => {
      const company = await transaction.company.findFirst({ where: { id: input.companyId, archivedAt: null } });
      if (!company) throw new UserFacingError("Customer not found.");
      const location = input.locationId ? await transaction.location.findFirst({ where: { id: input.locationId, companyId: company.id } }) : null;
      if (input.locationId && !location) throw new UserFacingError("That location belongs to a different customer.");

      const existing = await transaction.user.findUnique({ where: { email: input.email } });
      if (existing?.internalRole) throw new UserFacingError("That email address belongs to a staff member. Staff sign in to the workspace, not the customer portal.");
      if (existing && !existing.isActive) throw new UserFacingError("That person's account is disabled. Enable it on the Users page first.");
      const displayName = displayNameForPerson(input.firstName, input.lastName, input.email);
      const user = existing ?? await transaction.user.create({
        data: { identitySubject: `${invitedIdentityPrefix}${crypto.randomUUID()}`, email: input.email, displayName, firstName: input.firstName, lastName: input.lastName },
      });
      const scope = location ? "LOCATION" : "COMPANY";
      const already = await transaction.userAccess.findFirst({ where: { userId: user.id, companyId: company.id, locationId: location?.id ?? null, role: "CUSTOMER_USER" }, select: { id: true } });
      if (already) throw new UserFacingError(`${user.displayName} already has that access.`);
      const access = await transaction.userAccess.create({ data: { userId: user.id, companyId: company.id, locationId: location?.id ?? null, role: "CUSTOMER_USER", scope } });
      await recordAudit(transaction, { actorUserId: inviter.id, eventType: "user-access.invited", entityType: "UserAccess", entityId: access.id, metadata: { email: input.email, company: company.name, ...(location ? { location: location.name } : {}), newAccount: !existing } });
      await queueAccessEmail(transaction, {
        recipientEmail: input.email,
        userId: user.id,
        eventKey: `invitation:${access.id}`,
        subject: `You've been given access to ${company.name}'s repairs`,
        body: `Hello ${user.displayName},\n\n${inviter.displayName} at VacTech has given you access to the service portal for ${company.name}${location ? ` (${location.name})` : ""}. You can follow each repair, see photos, and download reports and other documents.\n\nSign in with this email address (${input.email}). The first time, you'll confirm the address with a one-time code and choose a password.`,
        linkPath: "/portal",
      });
    });
    revalidatePath("/workspace", "layout");
    return `Invitation sent to ${input.email}.`;
  });
}
