import type { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { auditCategories, type AuditCategory } from "@/features/audit/describe";
import { shopTimeZone } from "@/lib/dates";
import { pageWindow } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

export type AuditFilters = { search?: string; category?: AuditCategory; actorId?: string; from?: string; to?: string; overridesOnly?: boolean; page?: number };

const pageSize = 50;

/** The start or end of a calendar day (yyyy-mm-dd) in the shop's time zone, or null if it isn't a date. */
function dayBoundary(text: string | undefined, edge: "start" | "end") {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const day = DateTime.fromISO(text, { zone: shopTimeZone });
  if (!day.isValid) return null;
  return (edge === "start" ? day.startOf("day") : day.endOf("day")).toJSDate();
}

/** A page of the audit log, newest first, narrowed by the filters. */
export async function listAuditEvents(filters: AuditFilters = {}) {
  const search = filters.search?.trim() ?? "";
  const from = dayBoundary(filters.from, "start");
  const to = dayBoundary(filters.to, "end");
  const conditions: Prisma.AuditEventWhereInput[] = [];
  if (filters.category) conditions.push({ OR: auditCategories[filters.category].prefixes.map((prefix) => ({ eventType: { startsWith: `${prefix}.` } })) });
  if (filters.overridesOnly) conditions.push({ eventType: "checklist.overridden" });
  if (filters.actorId) conditions.push({ actorUserId: filters.actorId });
  if (from || to) conditions.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  if (search) {
    conditions.push({ OR: [
      { workOrder: { workOrderNumber: { contains: search, mode: "insensitive" } } },
      { actorUser: { displayName: { contains: search, mode: "insensitive" } } },
      { eventType: { contains: search.replace(/\s+/g, "-"), mode: "insensitive" } },
    ] });
  }
  const where: Prisma.AuditEventWhereInput = conditions.length ? { AND: conditions } : {};
  const page = Math.max(1, Math.floor(filters.page ?? 1));

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...pageWindow(page, pageSize),
      select: {
        id: true,
        eventType: true,
        customerVisible: true,
        metadata: true,
        createdAt: true,
        actorUser: { select: { displayName: true } },
        workOrder: { select: { id: true, workOrderNumber: true, summary: true } },
      },
    }),
    prisma.auditEvent.count({ where }),
  ]);
  return { events, total, page, pageSize };
}
