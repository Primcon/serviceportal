"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { canSignQaSteps } from "@/features/checklists/checklist";
import { ensureActiveChecklistTemplate } from "@/features/checklists/default-template";
import type { ActionResult } from "@/lib/action-result";
import { AccessDeniedError, UserFacingError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { runAction } from "@/lib/run-action";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser } from "@/services/authorization";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

const ids = z.object({ workOrderId: z.string().uuid(), stepId: z.string().uuid() });

function revalidate(workOrderId: string) {
  revalidatePath(`/workspace/work-orders/${workOrderId}`);
}

/**
 * Signs a checklist step as the person signed in: their initials and today's date, plus the
 * reading or item results the step asks for. A step can instead be marked not applicable,
 * with a note saying why.
 */
export async function signChecklistStep(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = ids.extend({
      notApplicable: z.boolean(),
      reading: z.string().trim().max(60),
      note: z.string().trim().max(500).transform((note) => note || null),
    }).parse({
      workOrderId: value(formData, "workOrderId"),
      stepId: value(formData, "stepId"),
      notApplicable: value(formData, "notApplicable") === "true",
      reading: value(formData, "reading"),
      note: value(formData, "note"),
    });
    const user = await getActiveInternalUser();

    await prisma.$transaction(async (transaction) => {
      const workOrder = await transaction.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, checklistTemplateId: true, completedAt: true, condition: true } });
      if (!workOrder) throw new UserFacingError("Work order not found.");
      if (workOrder.completedAt || workOrder.condition === "CANCELLED") throw new UserFacingError("This job is closed, so its checklist can't be changed.");
      const step = workOrder.checklistTemplateId ? await transaction.checklistTemplateStep.findFirst({ where: { id: input.stepId, templateId: workOrder.checklistTemplateId } }) : null;
      if (!step) throw new UserFacingError("That step isn't on this job's checklist.");
      if (step.requiresQa && !canSignQaSteps(user.internalRole)) throw new AccessDeniedError("This step needs a quality assurance sign-off.");
      if (await transaction.workOrderStepRecord.findUnique({ where: { workOrderId_templateStepId: { workOrderId: workOrder.id, templateStepId: step.id } }, select: { id: true } })) {
        throw new UserFacingError("This step is already signed. Clear it first to sign it again.");
      }

      let reading: string | null = null;
      let checkedItems: string[] = [];
      let notApplicableItems: string[] = [];
      if (input.notApplicable) {
        if (!input.note) throw new UserFacingError("Say why this step doesn't apply.");
      } else if (step.type === "READING") {
        if (!input.reading) throw new UserFacingError(`Enter the reading${step.unit ? ` in ${step.unit}` : ""}.`);
        reading = input.reading;
      } else if (step.type === "CHECKLIST") {
        // Each item arrives as item:<index> = "done" or "na".
        const states = step.items.map((_, index) => value(formData, `item:${index}`));
        const missing = step.items.filter((_, index) => states[index] !== "done" && states[index] !== "na");
        if (missing.length) throw new UserFacingError(`Mark each item done or N/A. Still open: ${missing.join(", ")}.`);
        checkedItems = step.items.filter((_, index) => states[index] === "done");
        notApplicableItems = step.items.filter((_, index) => states[index] === "na");
      }

      const record = await transaction.workOrderStepRecord.create({
        data: { workOrderId: workOrder.id, templateStepId: step.id, performedById: user.id, notApplicable: input.notApplicable, reading, checkedItems, notApplicableItems, note: input.note },
      });
      await recordAudit(transaction, {
        workOrderId: workOrder.id,
        actorUserId: user.id,
        eventType: input.notApplicable ? "checklist-step.marked-not-applicable" : "checklist-step.signed",
        entityType: "WorkOrderStepRecord",
        entityId: record.id,
        metadata: { step: step.label, ...(reading ? { reading, unit: step.unit } : {}), ...(notApplicableItems.length ? { notApplicableItems } : {}), ...(step.requiresQa ? { qa: true } : {}) },
      });
    });
    revalidate(input.workOrderId);
    return input.notApplicable ? "Marked not applicable." : "Signed.";
  });
}

/** Removes a sign-off so the step can be done again. The person who signed it or a manager can do this. */
export async function clearChecklistStep(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = ids.parse({ workOrderId: value(formData, "workOrderId"), stepId: value(formData, "stepId") });
    const user = await getActiveInternalUser();
    await prisma.$transaction(async (transaction) => {
      const record = await transaction.workOrderStepRecord.findUnique({
        where: { workOrderId_templateStepId: { workOrderId: input.workOrderId, templateStepId: input.stepId } },
        select: { id: true, performedById: true, reading: true, templateStep: { select: { label: true } }, performedBy: { select: { displayName: true } }, workOrder: { select: { completedAt: true, condition: true } } },
      });
      if (!record) throw new UserFacingError("This step isn't signed.");
      if (record.workOrder.completedAt || record.workOrder.condition === "CANCELLED") throw new UserFacingError("This job is closed, so its checklist can't be changed.");
      const isManager = user.internalRole === UserRole.PORTAL_ADMINISTRATOR || user.internalRole === UserRole.VACTECH_MANAGER;
      if (record.performedById !== user.id && !isManager) throw new AccessDeniedError("Only the person who signed this step or a manager can clear it.");
      await transaction.workOrderStepRecord.delete({ where: { id: record.id } });
      await recordAudit(transaction, {
        workOrderId: input.workOrderId,
        actorUserId: user.id,
        eventType: "checklist-step.cleared",
        entityType: "WorkOrderStepRecord",
        entityId: record.id,
        metadata: { step: record.templateStep.label, signedBy: record.performedBy.displayName, ...(record.reading ? { reading: record.reading } : {}) },
      });
    });
    revalidate(input.workOrderId);
    return "Sign-off cleared.";
  });
}

/** Puts a job that was opened before checklists existed onto the current checklist. */
export async function startChecklist(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const workOrderId = z.string().uuid().parse(value(formData, "workOrderId"));
    const user = await getActiveInternalUser();
    const template = await ensureActiveChecklistTemplate(prisma);
    if (!template) throw new UserFacingError("No checklist is active. A manager can make one active under Checklists.");
    await prisma.$transaction(async (transaction) => {
      const workOrder = await transaction.workOrder.findUnique({ where: { id: workOrderId }, select: { checklistTemplateId: true } });
      if (!workOrder) throw new UserFacingError("Work order not found.");
      if (workOrder.checklistTemplateId) return;
      await transaction.workOrder.update({ where: { id: workOrderId }, data: { checklistTemplateId: template.id } });
      await recordAudit(transaction, { workOrderId, actorUserId: user.id, eventType: "checklist.started", entityType: "WorkOrder", entityId: workOrderId, metadata: { form: template.formNumber, revision: template.revision } });
    });
    revalidate(workOrderId);
    return "Checklist started.";
  });
}
