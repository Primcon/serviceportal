import type { ListKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
