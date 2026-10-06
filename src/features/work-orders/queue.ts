import type { Prisma } from "@prisma/client";
import { openWorkOrderWhere } from "@/features/records/merge";
import { prisma } from "@/lib/prisma";

const dayInMilliseconds = 24 * 60 * 60 * 1000;

/** Whole days between a moment and now, never negative. */
export function wholeDaysSince(date: Date, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / dayInMilliseconds));
}

/** A promised date is stored as midnight UTC of that day, and the job is overdue from the day after. */
export function isOverdue(promisedAt: Date | null, now = new Date()) {
  if (!promisedAt) return false;
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) > promisedAt.getTime();
}

const queueSelect = {
  id: true,
  workOrderNumber: true,
  summary: true,
  priority: true,
  condition: true,
  promisedAt: true,
  stageEnteredAt: true,
  company: { select: { name: true } },
  equipment: { select: { productModel: true, serialNumber: true } },
  serviceStage: { select: { id: true, displayName: true, sequence: true } },
  assignedTo: { select: { id: true, displayName: true } },
} satisfies Prisma.WorkOrderSelect;

export type QueueWorkOrder = Prisma.WorkOrderGetPayload<{ select: typeof queueSelect }>;

/** Open work orders for a queue, furthest-along stage last and longest-waiting first within a stage. */
export function openWorkOrders(where: Prisma.WorkOrderWhereInput = {}, take = 50) {
  return prisma.workOrder.findMany({
    where: { ...openWorkOrderWhere, ...where },
    orderBy: [{ serviceStage: { sequence: "asc" } }, { stageEnteredAt: "asc" }],
    take,
    select: queueSelect,
  });
}

/** Counts for the tiles above the queues. */
export async function queueCounts(userId: string) {
  const today = new Date();
  const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const [mine, unassigned, overdue, waiting] = await Promise.all([
    prisma.workOrder.count({ where: { ...openWorkOrderWhere, assignedToId: userId } }),
    prisma.workOrder.count({ where: { ...openWorkOrderWhere, assignedToId: null } }),
    prisma.workOrder.count({ where: { ...openWorkOrderWhere, promisedAt: { lt: startOfToday } } }),
    prisma.workOrder.count({ where: { ...openWorkOrderWhere, condition: { in: ["WAITING_ON_PARTS", "AWAITING_CUSTOMER", "CUSTOMER_HOLD"] } } }),
  ]);
  return { mine, unassigned, overdue, waiting };
}
