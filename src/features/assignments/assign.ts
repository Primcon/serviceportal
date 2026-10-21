import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/services/audit";
import { notifyStaff } from "@/services/notifications";

/**
 * Gives a work order to a person, or puts it back in its stage's queue (assigneeId null),
 * and records the handoff. Returns false when nothing changed.
 */
export async function setWorkOrderAssignee(transaction: Prisma.TransactionClient, input: { workOrderId: string; assigneeId: string | null; actorUserId: string; note: string | null }) {
  const workOrder = await transaction.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, assignedToId: true, serviceStageId: true, workOrderNumber: true, summary: true, serviceStage: { select: { displayName: true } } } });
  if (!workOrder) throw new UserFacingError("Work order not found.");
  if (workOrder.assignedToId === input.assigneeId && !input.note) return false;
  // Someone taking a job themselves has just been checked as active staff.
  if (input.assigneeId && input.assigneeId !== input.actorUserId) {
    const assignee = await transaction.user.findUnique({ where: { id: input.assigneeId }, select: { isActive: true, internalRole: true } });
    if (!assignee?.isActive || !assignee.internalRole) throw new UserFacingError("Choose an active staff member to hand this to.");
  }
  await transaction.workOrder.update({ where: { id: workOrder.id }, data: { assignedToId: input.assigneeId } });
  const assignment = await transaction.workOrderAssignment.create({
    data: { workOrderId: workOrder.id, assignedToId: input.assigneeId, assignedById: input.actorUserId, serviceStageId: workOrder.serviceStageId, note: input.note },
  });
  await recordAudit(transaction, {
    workOrderId: workOrder.id,
    actorUserId: input.actorUserId,
    eventType: input.assigneeId ? "work-order.assigned" : "work-order.unassigned",
    entityType: "WorkOrderAssignment",
    entityId: assignment.id,
    metadata: { from: workOrder.assignedToId, to: input.assigneeId },
  });
  // Someone else handing it over: tell the person who has it now.
  if (input.assigneeId && input.assigneeId !== input.actorUserId) {
    const actor = await transaction.user.findUnique({ where: { id: input.actorUserId }, select: { displayName: true } });
    await notifyStaff(transaction, {
      userId: input.assigneeId,
      workOrderId: workOrder.id,
      eventKey: `handoff:${assignment.id}`,
      subject: `WIP ${workOrder.workOrderNumber} handed to you`,
      body: `${actor?.displayName ?? "Someone"} handed you WIP ${workOrder.workOrderNumber} (${workOrder.summary}), in ${workOrder.serviceStage.displayName}.${input.note ? `\n\n${input.note}` : ""}`,
      linkPath: `/workspace/work-orders/${workOrder.id}`,
      email: "if-chosen",
    });
  }
  return true;
}

/** Active staff a work order can be handed to, for pickers. */
export function assignableStaff() {
  return prisma.user.findMany({ where: { isActive: true, internalRole: { not: null } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, internalRole: true } });
}
