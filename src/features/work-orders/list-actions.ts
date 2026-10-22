"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { assignWorkOrder } from "@/features/assignments/actions";
import { updateWorkOrderStatus } from "@/features/work-orders/actions";
import { filterQuery } from "@/features/work-orders/list-filters";
import { getActiveInternalUser } from "@/services/authorization";

const maxSavedFilters = 20;
/** More than this at once is likely a mistake, and each job is checked and recorded on its own. */
const maxBulkJobs = 50;

/** Saves the list's current filters under a name, for the person saving them. Saving a name again replaces it. */
export async function saveWorkOrderFilter(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const name = z.string().trim().min(1, "Give the filter a name.").max(60).parse(formData.get("name")?.toString() ?? "");
    const query = filterQuery(new URLSearchParams(formData.get("query")?.toString() ?? ""));
    if (!query) throw new UserFacingError("Choose some filters first, then save them.");
    const user = await getActiveInternalUser();
    const existing = await prisma.savedFilter.findUnique({ where: { userId_name: { userId: user.id, name } }, select: { id: true } });
    if (!existing && await prisma.savedFilter.count({ where: { userId: user.id } }) >= maxSavedFilters) {
      throw new UserFacingError(`You can keep up to ${maxSavedFilters} saved filters. Remove one first.`);
    }
    await prisma.savedFilter.upsert({ where: { userId_name: { userId: user.id, name } }, create: { userId: user.id, name, query }, update: { query } });
    revalidatePath("/workspace/work-orders");
    return existing ? `"${name}" updated.` : `"${name}" saved.`;
  });
}

export async function deleteWorkOrderFilter(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const id = z.string().uuid().parse(formData.get("filterId")?.toString() ?? "");
    const user = await getActiveInternalUser();
    // Only ever the person's own filter.
    await prisma.savedFilter.deleteMany({ where: { id, userId: user.id } });
    revalidatePath("/workspace/work-orders");
    return "Filter removed.";
  });
}

/**
 * Hands several jobs to someone, or moves them to a stage, in one go. Each job goes through the
 * same action as doing it on its own page, with the same checks, hand-off records and audit
 * entries; any that can't be changed are listed with the reason.
 */
export async function bulkUpdateWorkOrders(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      ids: z.array(z.string().uuid()).min(1, "Tick the jobs to change first.").max(maxBulkJobs, `Change up to ${maxBulkJobs} jobs at a time.`),
      operation: z.enum(["handoff", "stage"]),
      assigneeId: z.string().uuid().or(z.literal("")).or(z.literal("me")),
      serviceStageId: z.string().uuid().or(z.literal("")),
      note: z.string().trim().max(1000),
      overrideReason: z.string().trim().max(500),
    }).parse({
      ids: [...new Set(formData.getAll("ids").map(String))],
      operation: formData.get("operation")?.toString() ?? "",
      assigneeId: formData.get("assigneeId")?.toString() ?? "",
      serviceStageId: formData.get("serviceStageId")?.toString() ?? "",
      note: formData.get("note")?.toString() ?? "",
      overrideReason: formData.get("overrideReason")?.toString() ?? "",
    });
    await getActiveInternalUser();
    if (input.operation === "stage" && !input.serviceStageId) throw new UserFacingError("Choose the stage to move them to.");

    const jobs = await prisma.workOrder.findMany({ where: { id: { in: input.ids } }, select: { id: true, workOrderNumber: true, condition: true } });
    const done: string[] = [];
    const failed: string[] = [];
    for (const job of jobs) {
      const each = new FormData();
      each.set("workOrderId", job.id);
      each.set("note", input.note);
      let result;
      if (input.operation === "handoff") {
        each.set("assigneeId", input.assigneeId);
        result = await assignWorkOrder(each);
      } else {
        each.set("serviceStageId", input.serviceStageId);
        each.set("condition", job.condition);
        each.set("overrideReason", input.overrideReason);
        result = await updateWorkOrderStatus(each);
      }
      if (result.status === "success") done.push(job.workOrderNumber);
      else failed.push(`${job.workOrderNumber}: ${result.message ?? "not changed"}`);
    }
    revalidatePath("/workspace", "layout");
    if (!failed.length) return `Done for ${done.length} job${done.length === 1 ? "" : "s"}.`;
    throw new UserFacingError(`${done.length ? `Done for ${done.length}. ` : ""}Not changed: ${failed.join(" · ")}`);
  });
}
