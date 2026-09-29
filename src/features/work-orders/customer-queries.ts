import { CustomerFacingStatus, RecordVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { customerEquipmentAccessWhere, customerWorkOrderAccessWhere } from "@/services/authorization-policy";

export type CustomerWorkOrderFilters = {
  search?: string;
  status?: string;
};

export async function listCustomerWorkOrders(
  identitySubject: string,
  filters: CustomerWorkOrderFilters = {},
) {
  const user = await prisma.user.findUnique({
    where: { identitySubject },
    select: { id: true, isActive: true },
  });

  if (!user?.isActive) {
    return [];
  }

  const search = filters.search?.trim() ?? "";
  const status = Object.values(CustomerFacingStatus).includes(filters.status as CustomerFacingStatus)
    ? (filters.status as CustomerFacingStatus)
    : undefined;

  return prisma.workOrder.findMany({
    where: {
      ...customerWorkOrderAccessWhere(user.id),
      ...(status ? { customerFacingStatus: status } : {}),
      ...(search ? {
        OR: [
          { workOrderNumber: { contains: search, mode: "insensitive" } },
          { summary: { contains: search, mode: "insensitive" } },
          { equipment: { productModel: { contains: search, mode: "insensitive" } } },
          { equipment: { serialNumber: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    },
    select: {
      id: true,
      workOrderNumber: true,
      summary: true,
      customerFacingStatus: true,
      updatedAt: true,
      equipment: {
        select: { productModel: true, serialNumber: true },
      },
      serviceStage: { select: { displayName: true } },
      updates: {
        where: { visibility: RecordVisibility.CUSTOMER_VISIBLE },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { title: true, body: true, createdAt: true },
      },
      attachments: {
        where: {
          visibility: RecordVisibility.CUSTOMER_VISIBLE,
            kind: { in: ["PHOTO", "DOCUMENT"] },
        },
        select: { id: true, fileName: true, thumbnailStorageKey: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getCustomerWorkOrder(
  identitySubject: string,
  workOrderId: string,
) {
  const user = await prisma.user.findUnique({
    where: { identitySubject },
    select: { id: true, isActive: true },
  });

  if (!user?.isActive) {
    return null;
  }

  return prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      ...customerWorkOrderAccessWhere(user.id),
    },
    select: {
      id: true,
      workOrderNumber: true,
      summary: true,
      customerFacingStatus: true,
      updatedAt: true,
      receivedAt: true,
      company: { select: { name: true } },
      equipment: { select: { id: true, productModel: true, serialNumber: true } },
      serviceStage: { select: { displayName: true, sequence: true } },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          condition: true,
          createdAt: true,
          serviceStage: { select: { displayName: true } },
        },
      },
      updates: {
        where: { visibility: RecordVisibility.CUSTOMER_VISIBLE },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, body: true, createdAt: true },
      },
      auditEvents: {
        where: { customerVisible: true },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, eventType: true, createdAt: true },
      },
      attachments: {
        where: {
          visibility: RecordVisibility.CUSTOMER_VISIBLE,
          kind: { in: ["PHOTO", "DOCUMENT"] },
        },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          kind: true,
          fileName: true,
          photoCategory: true,
          documentType: true,
          thumbnailStorageKey: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
        },
      },
    },
  });
}

export async function getCustomerEquipment(
  identitySubject: string,
  equipmentId: string,
) {
  const user = await prisma.user.findUnique({
    where: { identitySubject },
    select: { id: true, isActive: true },
  });

  if (!user?.isActive) {
    return null;
  }

  return prisma.equipment.findFirst({
    where: {
      id: equipmentId,
      ...customerEquipmentAccessWhere(user.id),
    },
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
          customerFacingStatus: true,
          updatedAt: true,
          serviceStage: { select: { displayName: true } },
        },
      },
    },
  });
}

export async function listCustomerEquipment(identitySubject: string, search = "") {
  const user = await prisma.user.findUnique({
    where: { identitySubject },
    select: { id: true, isActive: true },
  });
  if (!user?.isActive) return [];

  return prisma.equipment.findMany({
    where: {
      ...customerEquipmentAccessWhere(user.id),
      ...(search.trim() ? {
        OR: [
          { productModel: { contains: search.trim(), mode: "insensitive" } },
          { serialNumber: { contains: search.trim(), mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: [{ productModel: "asc" }, { serialNumber: "asc" }],
    select: {
      id: true,
      productModel: true,
      serialNumber: true,
      company: { select: { name: true } },
      workOrders: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { customerFacingStatus: true, updatedAt: true },
      },
    },
  });
}

export async function getCustomerNotificationHistory(identitySubject: string) {
  const user = await prisma.user.findUnique({
    where: { identitySubject },
    select: { id: true, email: true, isActive: true },
  });
  if (!user?.isActive) return [];

  return prisma.notification.findMany({
    where: {
      recipientEmail: user.email,
      workOrder: {
        ...customerWorkOrderAccessWhere(user.id),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      status: true,
      createdAt: true,
      workOrder: { select: { id: true, workOrderNumber: true, summary: true } },
      serviceUpdate: { select: { title: true, body: true } },
    },
  });
}

export async function getCustomerNotificationPreference(identitySubject: string) {
  const user = await prisma.user.findUnique({
    where: { identitySubject },
    select: { id: true, isActive: true },
  });
  if (!user?.isActive) return null;

  const preference = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
  return preference?.emailUpdates ?? true;
}

export async function getCustomerAccount(identitySubject: string) {
  const user = await prisma.user.findUnique({
    where: { identitySubject },
    select: {
      id: true,
      displayName: true,
      email: true,
      isActive: true,
      access: {
        where: { role: "CUSTOMER_USER" },
        select: {
          scope: true,
          company: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
    },
  });
  if (!user?.isActive) return null;
  return user;
}