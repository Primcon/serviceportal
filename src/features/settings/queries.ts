import type { ListKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { workOrderSequence } from "@/features/work-orders/intake";

/** Options for a work order picklist, in display order. Inactive options are left out unless asked for. */
export function listOptions(kind: ListKind, { includeInactive = false } = {}) {
  return prisma.listOption.findMany({
    where: { kind, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, kind: true, label: true, sortOrder: true, isActive: true },
  });
}

export function serviceCenters({ includeInactive = false } = {}) {
  return prisma.serviceCenter.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, isActive: true, _count: { select: { workOrders: true } } },
  });
}

/** The highest number part of any WIP number in use, such as 48366 for "48366 AZ", or 0 when there are none. */
export async function highestWorkOrderNumber(client: Pick<typeof prisma, "$queryRaw"> = prisma) {
  const [row] = await client.$queryRaw<{ highest: number | null }[]>`
    SELECT MAX(substring("workOrderNumber" FROM '^[0-9]{1,9}')::integer) AS highest FROM "WorkOrder"`;
  return row?.highest ?? 0;
}

/** The WIP number the next intake will get (before skipping any already in use), and the highest in use. */
export async function workOrderNumbering() {
  const [sequence, highest] = await Promise.all([
    prisma.numberSequence.findUnique({ where: { name: workOrderSequence } }),
    highestWorkOrderNumber(),
  ]);
  return { next: Math.max(sequence?.nextValue ?? 1, highest + 1), highest };
}
