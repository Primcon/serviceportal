import { z } from "zod";
import { CustomerFacingStatus, Prisma, WorkOrderCondition } from "@prisma/client";
import { workOrderSearchWhere } from "@/features/search/queries";
import { openWorkOrderWhere } from "@/features/records/merge";
import { shopToday } from "@/lib/dates";
import { firstParam, type SearchParams } from "@/lib/pagination";

/** The query parameters the work order list understands, in the order a saved filter keeps them. */
export const workOrderFilterKeys = ["search", "status", "stage", "condition", "center", "priority", "company", "assignee", "open", "overdue"] as const;

function oneOf<T extends string>(values: T[], value: string | undefined) {
  return values.includes(value as T) ? value as T : undefined;
}

/**
 * Reads the work order list's filters from its query string. The page, its spreadsheet
 * download and saved filters all use this, so they always agree on what a filter means.
 */
export function readWorkOrderFilters(params: SearchParams, viewerId: string) {
  const search = firstParam(params.search)?.trim() ?? "";
  const status = oneOf(Object.values(CustomerFacingStatus), firstParam(params.status));
  const condition = oneOf(Object.values(WorkOrderCondition), firstParam(params.condition));
  const stageId = z.string().uuid().safeParse(firstParam(params.stage)).data ?? "";
  const centerId = z.string().uuid().safeParse(firstParam(params.center)).data ?? "";
  const priority = firstParam(params.priority)?.trim() ?? "";
  // Set by the links on a customer's page, to show only that customer's work orders.
  const companyId = z.string().uuid().safeParse(firstParam(params.company)).data;
  // Who has the job: "me", "none" (waiting in the queue), or a staff member's ID.
  const assignee = firstParam(params.assignee) ?? "";
  const assigneeId = assignee === "me" ? viewerId : z.string().uuid().safeParse(assignee).data;
  const openOnly = firstParam(params.open) === "1";
  const overdueOnly = firstParam(params.overdue) === "1";

  const where: Prisma.WorkOrderWhereInput = {
    ...(openOnly || overdueOnly ? openWorkOrderWhere : {}),
    ...(overdueOnly ? { promisedAt: { lt: shopToday() } } : {}),
    ...(assignee === "none" ? { assignedToId: null } : assigneeId ? { assignedToId: assigneeId } : {}),
    ...(status ? { customerFacingStatus: status } : {}),
    ...(condition ? { condition } : {}),
    ...(stageId ? { serviceStageId: stageId } : {}),
    ...(centerId ? { serviceCenterId: centerId } : {}),
    ...(priority ? { priority } : {}),
    ...(companyId ? { companyId } : {}),
    ...(search ? workOrderSearchWhere(search) : {}),
  };
  const filtersApplied = Boolean(search || status || condition || stageId || centerId || priority || companyId || assignee || openOnly || overdueOnly);
  return { search, status, condition, stageId, centerId, priority, companyId, assignee, openOnly, overdueOnly, where, filtersApplied, query: filterQuery(params) };
}

/** The list's filters as a query string, without paging, such as "assignee=me&open=1". */
export function filterQuery(params: SearchParams | URLSearchParams) {
  const read = (key: string) => (params instanceof URLSearchParams ? params.get(key) : firstParam(params[key])) ?? "";
  const query = new URLSearchParams();
  for (const key of workOrderFilterKeys) {
    const value = read(key).trim();
    if (value) query.set(key, value.slice(0, 200));
  }
  return query.toString();
}
