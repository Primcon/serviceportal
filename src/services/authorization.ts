import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { getRequestActor } from "@/services/request-actor";
import { assertActiveUser, isAllowedInternalRole } from "@/services/authorization-policy";

export async function getActiveInternalUser() {
  return getActiveInternalUserForRoles([
    UserRole.PORTAL_ADMINISTRATOR,
    UserRole.VACTECH_MANAGER,
    UserRole.VACTECH_SERVICE_USER,
  ]);
}

export async function getActiveInternalUserForRoles(allowedRoles: UserRole[]) {
  const actor = await getRequestActor("employee");
  if (!actor) throw new Error("Authentication is required.");

  const user = await prisma.user.upsert({
    where: { identitySubject: actor.identitySubject },
    update: { displayName: actor.displayName, email: actor.email },
    create: {
      identitySubject: actor.identitySubject,
      email: actor.email,
      displayName: actor.displayName,
    },
  });
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
    throw new Error("Internal access is required.");
  }
  return user;
}

export async function getActiveCustomerUser() {
  const actor = await getRequestActor("customer");
  if (!actor) throw new Error("Authentication is required.");
  const user = await prisma.user.upsert({
    where: { identitySubject: actor.identitySubject },
    update: { displayName: actor.displayName, email: actor.email },
    create: {
      identitySubject: actor.identitySubject,
      email: actor.email,
      displayName: actor.displayName,
    },
  });
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
    throw new Error("Work order not found.");
  }
  return workOrder;
}
