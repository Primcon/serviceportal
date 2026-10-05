import type { Prisma } from "@prisma/client";
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
