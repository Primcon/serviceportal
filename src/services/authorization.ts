import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { AccessDeniedError, UserFacingError } from "@/lib/errors";
import { getRequestActor, type RequestAudience } from "@/services/request-actor";
import { assertActiveUser, isAllowedInternalRole } from "@/services/authorization-policy";

const internalRoles = [
  UserRole.PORTAL_ADMINISTRATOR,
  UserRole.VACTECH_MANAGER,
  UserRole.VACTECH_SERVICE_USER,
];

/**
 * Loads (or first creates) the persisted user behind the current request's identity.
 * Cached per request, so pages and actions that check access several times hit the
 * database once, and the user row is written only when the identity's name or email changed.
 */
const loadRequestUser = cache(async (audience: RequestAudience) => {
  const actor = await getRequestActor(audience);
  if (!actor) throw new AccessDeniedError("Sign in to continue.");

  const existing = await prisma.user.findUnique({ where: { identitySubject: actor.identitySubject } });
  if (!existing) {
    const user = await prisma.user.create({
      data: { identitySubject: actor.identitySubject, email: actor.email, displayName: actor.displayName },
    });
    return { actor, user };
  }
  if (existing.email === actor.email && existing.displayName === actor.displayName) {
    return { actor, user: existing };
  }
  const user = await prisma.user.update({
    where: { id: existing.id },
    data: { email: actor.email, displayName: actor.displayName },
  });
  return { actor, user };
});

export async function getActiveInternalUser() {
  return getActiveInternalUserForRoles(internalRoles);
}

export async function getActiveInternalUserForRoles(allowedRoles: UserRole[]) {
  const { actor, user } = await loadRequestUser("employee");
  return assertPersistedInternalRole(user.id, allowedRoles, actor.role);
}

export async function assertPersistedInternalRole(
  userId: string,
  allowedRoles: UserRole[],
  fallbackRole?: UserRole,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, internalRole: true },
  });
  assertActiveUser(user);
  const role = process.env.AUTH_MODE === "entra" ? user?.internalRole : fallbackRole;
  if (!role || !isAllowedInternalRole(role, allowedRoles)) {
    throw new AccessDeniedError("You don't have permission to do that.");
  }
  return { ...user, internalRole: role };
}

export async function getActiveCustomerUser() {
  const { user } = await loadRequestUser("customer");
  assertActiveUser(user);
  return user;
}

export async function getAuthorizedWorkOrder(workOrderId: string) {
  await getActiveInternalUser();
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, companyId: true, equipmentId: true, serviceStageId: true },
  });
  if (!workOrder) {
    throw new UserFacingError("Work order not found.");
  }
  return workOrder;
}
