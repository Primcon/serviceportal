import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

/** What the pump pickers need about each pump, including its most recent work order. */
const pumpSelect = {
  id: true,
  productModel: true,
  serialNumber: true,
  company: { select: { id: true, name: true } },
  location: { select: { name: true } },
  workOrders: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      id: true,
      workOrderNumber: true,
      completedAt: true,
      condition: true,
      toolId: true,
      oilType: true,
      contaminants: true,
      copperClassification: true,
      customerContactName: true,
      customerContactPhone: true,
      customerContactEmail: true,
    },
  },
} satisfies Prisma.EquipmentSelect;

/**
 * Pumps matching a search, each with any open work order (to warn about duplicates) and the
 * intake details from its last repair, so the new-work-order form can offer them again.
 */
export async function findPumps(where: Prisma.EquipmentWhereInput, take = 10) {
  const equipment = await prisma.equipment.findMany({ where, orderBy: [{ updatedAt: "desc" }], take, select: pumpSelect });
  return equipment.map((item) => {
    const last = item.workOrders[0];
    const isOpen = last && !last.completedAt && last.condition !== "CANCELLED";
    return {
      id: item.id,
      productModel: item.productModel,
      serialNumber: item.serialNumber,
      companyName: item.company.name,
      locationName: item.location?.name ?? null,
      openWorkOrder: isOpen ? { id: last.id, workOrderNumber: last.workOrderNumber } : null,
      lastIntake: last ? {
        toolId: last.toolId,
        oilType: last.oilType,
        contaminants: last.contaminants,
        copperClassification: last.copperClassification,
        customerContactName: last.customerContactName,
        customerContactPhone: last.customerContactPhone,
        customerContactEmail: last.customerContactEmail,
      } : null,
    };
  });
}

export type PumpResult = Awaited<ReturnType<typeof findPumps>>[number];

/** Pumps at other customers with exactly this serial number, ignoring case and merged duplicates. */
export function pumpsWithSerialElsewhere(client: Pick<Prisma.TransactionClient, "equipment">, companyId: string, serialNumber: string) {
  return client.equipment.findMany({
    where: { companyId: { not: companyId }, mergedIntoId: null, serialNumber: { equals: serialNumber.trim(), mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, productModel: true, serialNumber: true, company: { select: { name: true } } },
  });
}

/** Stops a pump being added when its serial is on record at another customer, unless the form confirms it. */
export async function checkSerialElsewhere(client: Pick<Prisma.TransactionClient, "equipment">, companyId: string, serialNumber: string, confirmed: boolean) {
  if (confirmed) return;
  const elsewhere = await pumpsWithSerialElsewhere(client, companyId, serialNumber);
  if (elsewhere.length) {
    throw new UserFacingError(`Serial ${serialNumber} is already on record at ${elsewhere.map((pump) => pump.company.name).join(", ")}. If that's right, tick "add it for this customer" under the serial number.`);
  }
}
