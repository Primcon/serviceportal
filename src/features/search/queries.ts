import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { managerRoles } from "@/features/navigation/workspace-items";

const resultLimit = 10;

function contains(term: string) {
  return { contains: term, mode: "insensitive" as const };
}

export function workOrderSearchWhere(term: string): Prisma.WorkOrderWhereInput {
  return {
    OR: [
      { workOrderNumber: contains(term) },
      { summary: contains(term) },
      { customerPurchaseOrder: contains(term) },
      { rmaReference: contains(term) },
      { toolId: contains(term) },
      { customerContactName: contains(term) },
      { company: { name: contains(term) } },
      { equipment: { serialNumber: contains(term) } },
      { equipment: { productModel: contains(term) } },
    ],
  };
}

/** The work order whose WIP number is exactly the search, so typing a number can open it directly. */
export function findWorkOrderByExactNumber(term: string) {
  return prisma.workOrder.findMany({
    where: { workOrderNumber: { equals: term.trim(), mode: "insensitive" } },
    select: { id: true },
    take: 2,
  });
}

/** Searches work orders, equipment and (for managers) customers. Callers must check workspace access first. */
export async function searchWorkspace(term: string, role: UserRole) {
  const query = term.trim();
  if (!query) return { workOrders: [], equipment: [], customers: [], canSeeCustomers: managerRoles.includes(role) };
  const canSeeCustomers = managerRoles.includes(role);
  const [workOrders, equipment, customers] = await Promise.all([
    prisma.workOrder.findMany({
      where: workOrderSearchWhere(query),
      orderBy: { updatedAt: "desc" },
      take: resultLimit,
      select: { id: true, workOrderNumber: true, summary: true, customerFacingStatus: true, company: { select: { name: true } }, equipment: { select: { productModel: true, serialNumber: true } }, serviceStage: { select: { displayName: true } } },
    }),
    prisma.equipment.findMany({
      where: { OR: [{ serialNumber: contains(query) }, { productModel: contains(query) }, { company: { name: contains(query) } }] },
      orderBy: { updatedAt: "desc" },
      take: resultLimit,
      select: { id: true, productModel: true, serialNumber: true, archivedAt: true, company: { select: { name: true } } },
    }),
    canSeeCustomers
      ? prisma.company.findMany({
        where: { name: contains(query) },
        orderBy: { name: "asc" },
        take: resultLimit,
        select: { id: true, name: true, archivedAt: true, _count: { select: { equipment: true, workOrders: true } } },
      })
      : Promise.resolve([]),
  ]);
  return { workOrders, equipment, customers, canSeeCustomers };
}
