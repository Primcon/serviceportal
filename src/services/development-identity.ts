import { UserRole } from "@prisma/client";

type DevelopmentActorKind = "internal" | "customer";

export type DevelopmentActor = {
  identitySubject: string;
  email: string;
  displayName: string;
  role: UserRole;
};

const actors: Record<DevelopmentActorKind, DevelopmentActor> = {
  internal: {
    identitySubject: "development:service-manager",
    email: "service.manager@vactech.test",
    displayName: "Alex Morgan",
    role: UserRole.VACTECH_MANAGER,
  },
  customer: {
    identitySubject: "development:customer-user",
    email: "customer.user@vactech.test",
    displayName: "Jordan Lee",
    role: UserRole.CUSTOMER_USER,
  },
};

export function resolveDevelopmentInternalRole(value: string | undefined) {
  if (!value || value === UserRole.VACTECH_MANAGER) return UserRole.VACTECH_MANAGER;
  if (value === UserRole.PORTAL_ADMINISTRATOR) return UserRole.PORTAL_ADMINISTRATOR;
  if (value === UserRole.VACTECH_QA) return UserRole.VACTECH_QA;
  if (value === UserRole.VACTECH_SERVICE_USER) return UserRole.VACTECH_SERVICE_USER;
  throw new Error(`Unsupported DEVELOPMENT_INTERNAL_ROLE: ${value}`);
}

export function getDevelopmentActor(kind: DevelopmentActorKind): DevelopmentActor {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development identity cannot be used in production.");
  }

  if (kind === "internal") {
    return { ...actors.internal, role: resolveDevelopmentInternalRole(process.env.DEVELOPMENT_INTERNAL_ROLE) };
  }

  return actors.customer;
}