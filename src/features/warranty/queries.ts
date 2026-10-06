import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { shopToday, standardWarrantyMonths, warrantyEndDate } from "@/features/warranty/warranty";

type Client = Prisma.TransactionClient | PrismaClient;

/** The setting that decides whether customers are shown warranty dates. Off until a manager turns it on. */
export const customerWarrantySetting = "customer-warranty-visible";

export async function customerWarrantyVisible(client: Client = prisma) {
  const setting = await client.portalSetting.findUnique({ where: { key: customerWarrantySetting } });
  return setting?.value === "true";
}

/** The warranty length a repair would get today, from the customer's contract or the pump's model. */
export async function standardWarrantyFor(client: Client, workOrderId: string) {
  const workOrder = await client.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    select: { company: { select: { contractWarrantyMonths: true } }, equipment: { select: { catalogModel: { select: { warrantyMonths: true } } } } },
  });
  const contractMonths = workOrder.company.contractWarrantyMonths;
  const modelMonths = workOrder.equipment.catalogModel?.warrantyMonths ?? null;
  return { months: standardWarrantyMonths({ contractMonths, modelMonths }), source: contractMonths !== null ? "contract" as const : modelMonths !== null ? "model" as const : null };
}

const previousRepairSelect = { id: true, workOrderNumber: true, summary: true, shippedAt: true, warrantyMonths: true, warrantyEndsAt: true } satisfies Prisma.WorkOrderSelect;

/**
 * The repair a warranty claim on this job would be made against: the most recent earlier
 * repair of the same pump that has shipped. Null when the pump has no shipped repair before this one.
 */
export function previousShippedRepair(client: Client, workOrder: { id: string; equipmentId: string; createdAt: Date }) {
  return client.workOrder.findFirst({
    where: { equipmentId: workOrder.equipmentId, id: { not: workOrder.id }, shippedAt: { not: null }, createdAt: { lt: workOrder.createdAt } },
    orderBy: { shippedAt: "desc" },
    select: previousRepairSelect,
  });
}

/** The people who decide warranty claims. */
export function warrantyApprovers(client: Client = prisma) {
  return client.user.findMany({
    where: { isActive: true, canApproveWarranty: true, internalRole: { not: null } },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, email: true },
  });
}

export async function canApproveWarranty(userId: string, client: Client = prisma) {
  const user = await client.user.findUnique({ where: { id: userId }, select: { canApproveWarranty: true, isActive: true } });
  return Boolean(user?.isActive && user.canApproveWarranty);
}

/** Warranty claims nobody has decided yet, oldest first. */
export function pendingWarrantyClaims() {
  return prisma.workOrder.findMany({
    where: { warrantyDecision: "PENDING" },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      workOrderNumber: true,
      summary: true,
      company: { select: { name: true } },
      equipment: { select: { productModel: true, serialNumber: true } },
      warrantyClaimOn: { select: { workOrderNumber: true, warrantyEndsAt: true } },
    },
  });
}

/** The latest warranty on a pump: its most recently shipped repair that carries one. */
export function latestWarrantyForEquipment(equipmentId: string, client: Client = prisma) {
  return client.workOrder.findFirst({
    where: { equipmentId, warrantyEndsAt: { not: null } },
    orderBy: { shippedAt: "desc" },
    select: previousRepairSelect,
  });
}

/**
 * Starts a repair's warranty when it ships, if nobody has entered a ship date yet: the ship
 * date is today at the shop and the length is the customer's contract or the model's standard.
 * Returns the fields to save, or null when the ship date is already recorded.
 */
export async function shippingDefaults(transaction: Prisma.TransactionClient, workOrderId: string) {
  const current = await transaction.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { shippedAt: true, warrantyMonths: true } });
  if (current.shippedAt) return null;
  const shippedAt = shopToday();
  const warrantyMonths = current.warrantyMonths ?? (await standardWarrantyFor(transaction, workOrderId)).months;
  return { shippedAt, warrantyMonths, warrantyEndsAt: warrantyEndDate(shippedAt, warrantyMonths) };
}
