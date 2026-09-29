import { Prisma, UserRole } from "@prisma/client";

const internalRoles = new Set<UserRole>([
  UserRole.PORTAL_ADMINISTRATOR,
  UserRole.VACTECH_MANAGER,
  UserRole.VACTECH_SERVICE_USER,
]);

export function isInternalRole(role: UserRole) {
  return internalRoles.has(role);
}

export function isAllowedInternalRole(role: UserRole, allowedRoles: UserRole[]) {
  return isInternalRole(role) && allowedRoles.includes(role);
}

export function assertActiveUser<T extends { isActive: boolean }>(user: T | null): asserts user is T & { isActive: true } {
  if (!user?.isActive) {
    throw new Error("Your account is inactive.");
  }
}

export function customerWorkOrderAccessWhere(userId: string): Prisma.WorkOrderWhereInput {
  return {
    OR: [
      {
        company: {
          userAccess: {
            some: { userId, role: UserRole.CUSTOMER_USER, scope: "COMPANY" },
          },
        },
      },
      {
        location: {
          userAccess: {
            some: { userId, role: UserRole.CUSTOMER_USER, scope: "LOCATION" },
          },
        },
      },
    ],
  };
}

export function customerEquipmentAccessWhere(userId: string): Prisma.EquipmentWhereInput {
  return {
    OR: [
      {
        company: {
          userAccess: {
            some: { userId, role: UserRole.CUSTOMER_USER, scope: "COMPANY" },
          },
        },
      },
      {
        location: {
          userAccess: {
            some: { userId, role: UserRole.CUSTOMER_USER, scope: "LOCATION" },
          },
        },
      },
    ],
  };
}
