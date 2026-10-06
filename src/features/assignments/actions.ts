"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setWorkOrderAssignee } from "@/features/assignments/assign";
import type { ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { runAction } from "@/lib/run-action";
import { getActiveInternalUser } from "@/services/authorization";

/**
 * Hands a work order to someone, takes it yourself (assigneeId "me"), or returns it to the
 * queue (assigneeId ""). Any staff member can do this: the shop decides who works on what.
 */
export async function assignWorkOrder(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      workOrderId: z.string().uuid(),
      assigneeId: z.string().uuid().or(z.literal("")).or(z.literal("me")),
      note: z.string().trim().max(1000).transform((note) => note || null),
    }).parse({
      workOrderId: formData.get("workOrderId")?.toString() ?? "",
      assigneeId: formData.get("assigneeId")?.toString() ?? "",
      note: formData.get("note")?.toString() ?? "",
    });
    const user = await getActiveInternalUser();
    const assigneeId = input.assigneeId === "me" ? user.id : input.assigneeId || null;
    const changed = await prisma.$transaction((transaction) => setWorkOrderAssignee(transaction, { workOrderId: input.workOrderId, assigneeId, actorUserId: user.id, note: input.note }));
    revalidatePath("/workspace", "layout");
    if (!changed) return "No change: it's already there.";
    return assigneeId === user.id ? "It's yours." : assigneeId ? "Handed off." : "Returned to the queue.";
  });
}
