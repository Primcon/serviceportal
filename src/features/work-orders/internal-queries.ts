import { prisma } from "@/lib/prisma";
import { getActiveInternalUser, getActiveInternalUserForRoles } from "@/services/authorization";
import { Prisma, UserRole } from "@prisma/client";

export async function getInternalWorkOrder(workOrderId: string) {
  await getActiveInternalUser();

  return prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      company: { select: { name: true } },
      equipment: { select: { productModel: true, serialNumber: true } },
      serviceStage: { select: { displayName: true } },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        include: {
          serviceStage: { select: { displayName: true } },
          changedBy: { select: { displayName: true } },
        },
      },
      findings: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { displayName: true } } },
      },
      attachments: {
        orderBy: { uploadedAt: "desc" },
        select: { id: true, kind: true, fileName: true, photoCategory: true, documentType: true, visibility: true, mimeType: true, sizeBytes: true, uploadedAt: true },
      },
    },
  });
}

export async function getInternalWorkOrderActivity(workOrderId: string, page = 1) {
  await getActiveInternalUser();
  const pageSize = 12;
  const currentPage = Math.max(1, Math.floor(page));
  const where = { workOrderId };
  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        eventType: true,
        entityType: true,
        createdAt: true,
        actorUser: { select: { displayName: true } },
      },
    }),
    prisma.auditEvent.count({ where }),
  ]);
  return { events, total, page: currentPage, pageSize };
}

export async function listActiveServiceStages() {
  await getActiveInternalUser();
  return prisma.serviceStage.findMany({
    where: { isActive: true },
    orderBy: { sequence: "asc" },
    select: { id: true, displayName: true },
  });
}

export async function getInternalEquipment(equipmentId: string) {
  await getActiveInternalUser();

  return prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: {
      productModel: true,
      serialNumber: true,
      description: true,
      company: { select: { name: true } },
      workOrders: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          workOrderNumber: true,
          summary: true,
          condition: true,
          updatedAt: true,
          serviceStage: { select: { displayName: true } },
        },
      },
    },
  });
}

export async function listInternalAuditEvents(search = "", page = 1) {
  await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const term = search.trim();
  const where: Prisma.AuditEventWhereInput | undefined = term ? {
    OR: [
      { eventType: { contains: term, mode: "insensitive" } },
      { entityType: { contains: term, mode: "insensitive" } },
      { entityId: { contains: term, mode: "insensitive" } },
      { actorUser: { displayName: { contains: term, mode: "insensitive" } } },
    ],
  } : undefined;
  const pageSize = 50;
  const currentPage = Math.max(1, Math.floor(page));

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        eventType: true,
        entityType: true,
        entityId: true,
        customerVisible: true,
        createdAt: true,
        actorUser: { select: { displayName: true } },
        workOrder: { select: { workOrderNumber: true, summary: true } },
      },
    }),
    prisma.auditEvent.count({ where }),
  ]);
  return { events, total, page: currentPage, pageSize };
}

export async function listInternalUsers(filters: { search?: string; status?: string; role?: string; page?: number; pageSize?: number } = {}) {
  await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const search = filters.search?.trim() ?? "";
  const status = filters.status === "active" ? true : filters.status === "disabled" ? false : undefined;
  const role = Object.values(UserRole).includes(filters.role as UserRole) ? filters.role as UserRole : undefined;
  const where: Prisma.UserWhereInput = {
      ...(status === undefined ? {} : { isActive: status }),
      // Role and search each need their own OR, so they are combined with AND
      // (spreading both into one object would let search overwrite the role filter).
      AND: [
        ...(role ? [{ OR: [{ internalRole: role }, { access: { some: { role } } }] }] : []),
        ...(search ? [{ OR: [{ displayName: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] }] : []),
      ],
  };
  const pageSize = filters.pageSize ?? 25;
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const [total, users] = await Promise.all([prisma.user.count({ where }), prisma.user.findMany({
    where,
    orderBy: { displayName: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      displayName: true,
      email: true,
      isActive: true,
      internalRole: true,
      access: {
        select: { id: true, role: true, scope: true, company: { select: { name: true } }, location: { select: { name: true } } },
      },
    },
  })]);
  return { users, total, page, pageSize };
}

/** Totals for the user directory tiles, counted in the database rather than by loading every user. */
export async function userDirectorySummary() {
  await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const [all, active, internal, customers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { internalRole: { not: null } } }),
    prisma.user.count({ where: { access: { some: {} } } }),
  ]);
  return { all, active, internal, customers };
}
