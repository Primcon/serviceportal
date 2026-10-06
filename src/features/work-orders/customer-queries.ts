import { CustomerFacingStatus, Prisma, RecordVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { customerEquipmentAccessWhere, customerWorkOrderAccessWhere } from "@/services/authorization-policy";
import { customerWarrantyVisible } from "@/features/warranty/queries";

export type CustomerWorkOrderFilters = {
  search?: string;
  status?: string;
  /** Narrows the list to one of the customer's companies. Access rules still apply. */
  companyId?: string;
  page?: number;
  pageSize?: number;
};

async function activeCustomerId(identitySubject: string) {
  const user = await prisma.user.findUnique({
    where: { identitySubject },
    select: { id: true, isActive: true },
  });
  return user?.isActive ? user.id : null;
}

export async function listCustomerWorkOrders(
  identitySubject: string,
  filters: CustomerWorkOrderFilters = {},
) {
  const pageSize = filters.pageSize ?? 20;
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const userId = await activeCustomerId(identitySubject);
  if (!userId) return { workOrders: [], total: 0, page, pageSize };

  const search = filters.search?.trim() ?? "";
  const status = Object.values(CustomerFacingStatus).includes(filters.status as CustomerFacingStatus)
    ? (filters.status as CustomerFacingStatus)
    : undefined;
  // The access rule and the search are both OR lists, so they're combined with AND. Spreading
  // them into one object would let the search replace the access rule.
  const where: Prisma.WorkOrderWhereInput = {
    AND: [
      customerWorkOrderAccessWhere(userId),
      ...(search ? [{
        OR: [
          { workOrderNumber: { contains: search, mode: "insensitive" as const } },
          { summary: { contains: search, mode: "insensitive" as const } },
          { customerPurchaseOrder: { contains: search, mode: "insensitive" as const } },
          { equipment: { productModel: { contains: search, mode: "insensitive" as const } } },
          { equipment: { serialNumber: { contains: search, mode: "insensitive" as const } } },
        ],
      }] : []),
    ],
    ...(status ? { customerFacingStatus: status } : {}),
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
  };

  const [total, workOrders] = await Promise.all([
    prisma.workOrder.count({ where }),
    prisma.workOrder.findMany({
      where,
      select: {
        id: true,
        workOrderNumber: true,
        summary: true,
        customerFacingStatus: true,
        updatedAt: true,
        equipment: {
          select: { productModel: true, serialNumber: true },
        },
        condition: true,
        company: { select: { name: true } },
        serviceStage: { select: { displayName: true, customerLabel: true, sequence: true } },
        updates: {
          where: { visibility: RecordVisibility.CUSTOMER_VISIBLE },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { title: true, body: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { workOrders, total, page, pageSize };
}

/** How many of the customer's repairs are in each status, for the summary tiles. */
export async function countCustomerWorkOrdersByStatus(identitySubject: string) {
  const counts = new Map<CustomerFacingStatus, number>(Object.values(CustomerFacingStatus).map((status) => [status, 0]));
  const userId = await activeCustomerId(identitySubject);
  if (!userId) return counts;
  const groups = await prisma.workOrder.groupBy({
    by: ["customerFacingStatus"],
    where: customerWorkOrderAccessWhere(userId),
    _count: { _all: true },
  });
  for (const group of groups) counts.set(group.customerFacingStatus, group._count._all);
  return counts;
}

/**
 * Everything a customer is shown about a repair. Only customer-visible updates, findings
 * and files are selected, and nothing internal (notes, handoffs, the history of conditions).
 */
const customerWorkOrderSelect = {
  id: true,
  workOrderNumber: true,
  summary: true,
  customerFacingStatus: true,
  updatedAt: true,
  receivedAt: true,
  company: { select: { name: true } },
  equipment: { select: { id: true, productModel: true, serialNumber: true } },
  condition: true,
  // The promised date is the shop's internal target, so it isn't selected for customers.
  completedAt: true,
  // Blanked below unless customers are shown warranty dates.
  warrantyEndsAt: true,
  customerPurchaseOrder: true,
  rmaReference: true,
  serviceCenter: { select: { name: true, contactEmail: true, contactPhone: true } },
  serviceStage: { select: { displayName: true, customerLabel: true, sequence: true } },
  // Used only to date the steps of the progress tracker; internal notes aren't selected.
  statusHistory: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      serviceStage: { select: { displayName: true, customerLabel: true, sequence: true } },
    },
  },
  updates: {
    where: { visibility: RecordVisibility.CUSTOMER_VISIBLE },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, body: true, createdAt: true },
  },
  findings: {
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
      caption: true,
      photoCategory: true,
      documentType: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  },
} satisfies Prisma.WorkOrderSelect;

export type CustomerWorkOrder = Prisma.WorkOrderGetPayload<{ select: typeof customerWorkOrderSelect }>;

/** Blanks the warranty date unless the portal is set to show customers warranty dates. */
async function applyWarrantyRule<T extends { warrantyEndsAt: Date | null }>(workOrder: T | null) {
  if (!workOrder?.warrantyEndsAt) return workOrder;
  return (await customerWarrantyVisible()) ? workOrder : { ...workOrder, warrantyEndsAt: null };
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

  return applyWarrantyRule(await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      ...customerWorkOrderAccessWhere(user.id),
    },
    select: customerWorkOrderSelect,
  }));
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

  const equipment = await prisma.equipment.findFirst({
    where: {
      id: equipmentId,
      // A duplicate that was merged away isn't shown; its history is on the pump it was merged into.
      mergedIntoId: null,
      ...customerEquipmentAccessWhere(user.id),
    },
    select: {
      productModel: true,
      serialNumber: true,
      description: true,
      company: { select: { name: true } },
      // Manuals the service team has shared for this pump's model.
      catalogModel: {
        select: {
          documents: {
            where: { visibility: RecordVisibility.CUSTOMER_VISIBLE },
            orderBy: [{ documentType: "asc" }, { title: "asc" }],
            select: { id: true, title: true, documentType: true, visibility: true, fileName: true, sizeBytes: true },
          },
        },
      },
      workOrders: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          workOrderNumber: true,
          summary: true,
          customerFacingStatus: true,
          updatedAt: true,
          warrantyEndsAt: true,
          serviceStage: { select: { displayName: true, customerLabel: true } },
        },
      },
    },
  });
  if (!equipment) return null;
  const showWarranty = await customerWarrantyVisible();
  // The pump's current cover is the latest end date among its repairs.
  const warrantyEndsAt = showWarranty ? equipment.workOrders.reduce<Date | null>((latest, workOrder) => (workOrder.warrantyEndsAt && (!latest || workOrder.warrantyEndsAt > latest) ? workOrder.warrantyEndsAt : latest), null) : null;
  return { ...equipment, warrantyEndsAt };
}

export async function listCustomerEquipment(identitySubject: string, search = "", { page = 1, pageSize = 20 } = {}) {
  const currentPage = Math.max(1, Math.floor(page));
  const userId = await activeCustomerId(identitySubject);
  if (!userId) return { equipment: [], total: 0, page: currentPage, pageSize };

  // Combined with AND for the same reason as the work order list above.
  const where: Prisma.EquipmentWhereInput = {
    mergedIntoId: null,
    AND: [
      customerEquipmentAccessWhere(userId),
      ...(search.trim() ? [{
        OR: [
          { productModel: { contains: search.trim(), mode: "insensitive" as const } },
          { serialNumber: { contains: search.trim(), mode: "insensitive" as const } },
        ],
      }] : []),
    ],
  };
  const [total, equipment] = await Promise.all([prisma.equipment.count({ where }), prisma.equipment.findMany({
    where,
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
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
  })]);
  return { equipment, total, page: currentPage, pageSize };
}

/** The notifications a customer sees in their feed: about repairs they can still see, newest first. */
function customerFeedWhere(userId: string): Prisma.NotificationWhereInput {
  return { userId, kind: { not: "ACCESS" }, workOrder: customerWorkOrderAccessWhere(userId) };
}

export async function listCustomerNotifications(identitySubject: string, { page = 1, pageSize = 25 } = {}) {
  const currentPage = Math.max(1, Math.floor(page));
  const userId = await activeCustomerId(identitySubject);
  if (!userId) return { notifications: [], total: 0, unread: 0, page: currentPage, pageSize };
  const where = customerFeedWhere(userId);
  const [total, unread, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: { id: true, kind: true, subject: true, body: true, readAt: true, createdAt: true, workOrder: { select: { id: true, workOrderNumber: true, summary: true } } },
    }),
  ]);
  return { notifications, total, unread, page: currentPage, pageSize };
}

/** How many notifications the customer hasn't opened, for the badge in the navigation. */
export async function countUnreadNotifications(identitySubject: string) {
  const userId = await activeCustomerId(identitySubject);
  return userId ? prisma.notification.count({ where: { ...customerFeedWhere(userId), readAt: null } }) : 0;
}

/** Which kinds of notification the customer is emailed about. Everything is on until they turn it off. */
export async function getCustomerNotificationPreferences(identitySubject: string) {
  const userId = await activeCustomerId(identitySubject);
  if (!userId) return null;
  const preference = await prisma.notificationPreference.findUnique({ where: { userId } });
  return { emailUpdates: preference?.emailUpdates ?? true, emailStatusChanges: preference?.emailStatusChanges ?? true, emailDocuments: preference?.emailDocuments ?? true };
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
/** The companies a customer can see records for, for the company filter. Empty for an unknown or disabled user. */
export async function listCustomerCompanies(identitySubject: string) {
  const userId = await activeCustomerId(identitySubject);
  if (!userId) return [];
  return prisma.company.findMany({
    where: { userAccess: { some: { userId, role: "CUSTOMER_USER" } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** The workflow's stages as customers are shown them, for the progress tracker. */
export function customerProgressStages() {
  return prisma.serviceStage.findMany({ orderBy: { sequence: "asc" }, select: { sequence: true, displayName: true, customerLabel: true, isActive: true } });
}

/**
 * The same view of a repair a customer gets, for staff to preview. It uses the customer
 * selection, so what staff see here is exactly what the customer would. The caller checks
 * that the viewer is staff.
 */
export async function getWorkOrderAsCustomerSeesIt(workOrderId: string) {
  return applyWarrantyRule(await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: customerWorkOrderSelect }));
}
