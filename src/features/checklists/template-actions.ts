"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ChecklistStepType, type Prisma } from "@prisma/client";
import { z } from "zod";
import { ensureActiveChecklistTemplate } from "@/features/checklists/default-template";
import { managerRoles } from "@/features/navigation/workspace-items";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { runAction } from "@/lib/run-action";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUserForRoles } from "@/services/authorization";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

const id = z.string().uuid();
const lockedMessage = "Work orders already use this revision, so it can't be changed. Create a new revision instead.";

/** A revision can be edited until a work order uses it. After that it's a record of how those jobs were done. */
async function editableTemplate(transaction: Prisma.TransactionClient, templateId: string) {
  const template = await transaction.checklistTemplate.findUnique({ where: { id: templateId }, include: { _count: { select: { workOrders: true } } } });
  if (!template) throw new UserFacingError("Checklist not found.");
  if (template._count.workOrders > 0) throw new UserFacingError(lockedMessage);
  return template;
}

function revalidate() {
  revalidatePath("/workspace/checklists", "layout");
}

const identity = z.object({
  formNumber: z.string().trim().min(1).max(40),
  revision: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(160),
});

/** Corrects a checklist's form number, revision or name while it's still editable. */
export async function saveChecklistTemplate(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const templateId = id.parse(value(formData, "templateId"));
    const data = identity.parse({ formNumber: value(formData, "formNumber"), revision: value(formData, "revision"), name: value(formData, "name") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const template = await editableTemplate(transaction, templateId);
      const clash = await transaction.checklistTemplate.findFirst({ where: { id: { not: template.id }, formNumber: data.formNumber, revision: data.revision }, select: { id: true } });
      if (clash) throw new UserFacingError(`Form ${data.formNumber} Rev. ${data.revision} already exists.`);
      await transaction.checklistTemplate.update({ where: { id: template.id }, data });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "checklist-template.updated", entityType: "ChecklistTemplate", entityId: template.id, metadata: data });
    });
    revalidate();
    return "Checklist saved.";
  });
}

/** Starts a new revision as a copy of an existing one. It isn't used until it's made active. */
export async function createChecklistRevision(formData: FormData): Promise<ActionResult> {
  let createdId = "";
  const result = await runAction(async () => {
    const input = z.object({ templateId: id, revision: z.string().trim().min(1, "Enter the new revision, such as 10.").max(20) }).parse({ templateId: value(formData, "templateId"), revision: value(formData, "revision") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    createdId = await prisma.$transaction(async (transaction) => {
      const source = await transaction.checklistTemplate.findUnique({ where: { id: input.templateId }, include: { steps: true } });
      if (!source) throw new UserFacingError("Checklist not found.");
      if (await transaction.checklistTemplate.findFirst({ where: { formNumber: source.formNumber, revision: input.revision }, select: { id: true } })) {
        throw new UserFacingError(`Form ${source.formNumber} Rev. ${input.revision} already exists.`);
      }
      const copy = await transaction.checklistTemplate.create({
        data: {
          formNumber: source.formNumber,
          revision: input.revision,
          name: source.name,
          steps: { create: source.steps.map(({ serviceStageId, sequence, label, type, unit, items, requiresQa, isRequired }) => ({ serviceStageId, sequence, label, type, unit, items, requiresQa, isRequired })) },
        },
      });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "checklist-template.revision-created", entityType: "ChecklistTemplate", entityId: copy.id, metadata: { formNumber: copy.formNumber, revision: copy.revision, copiedFromRevision: source.revision } });
      return copy.id;
    });
    revalidate();
  });
  if (result.status === "success" && createdId) redirect(`/workspace/checklists/${createdId}`);
  return result;
}

/** Makes a revision the one new work orders use. Jobs already open stay on the revision they started with. */
export async function activateChecklistTemplate(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const templateId = id.parse(value(formData, "templateId"));
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const template = await transaction.checklistTemplate.findUnique({ where: { id: templateId }, include: { _count: { select: { steps: true } } } });
      if (!template) throw new UserFacingError("Checklist not found.");
      if (!template._count.steps) throw new UserFacingError("Add at least one step before making this checklist active.");
      await transaction.checklistTemplate.updateMany({ where: { isActive: true, id: { not: template.id } }, data: { isActive: false } });
      await transaction.checklistTemplate.update({ where: { id: template.id }, data: { isActive: true } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "checklist-template.activated", entityType: "ChecklistTemplate", entityId: template.id, metadata: { formNumber: template.formNumber, revision: template.revision } });
    });
    revalidate();
    return "This revision is now used for new work orders.";
  });
}

const stepFields = z.object({
  templateId: id,
  stepId: id.or(z.literal("")).transform((text) => text || null),
  serviceStageId: z.string().uuid("Choose the stage this step is done in."),
  label: z.string().trim().min(1).max(200),
  type: z.nativeEnum(ChecklistStepType),
  unit: z.string().trim().max(30),
  // One item per line.
  items: z.string().transform((text) => [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]),
  requiresQa: z.boolean(),
  isRequired: z.boolean(),
});

/** Adds a step to an editable checklist, or changes one. */
export async function saveChecklistStep(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = stepFields.parse({
      templateId: value(formData, "templateId"),
      stepId: value(formData, "stepId"),
      serviceStageId: value(formData, "serviceStageId"),
      label: value(formData, "label"),
      type: value(formData, "type"),
      unit: value(formData, "unit"),
      items: value(formData, "items"),
      requiresQa: formData.get("requiresQa") === "on",
      isRequired: formData.get("isRequired") === "on",
    });
    if (input.type === "CHECKLIST" && input.items.length < 2) throw new UserFacingError("List at least two items, one per line.");
    if (input.items.some((item) => item.length > 80)) throw new UserFacingError("Keep each item to 80 characters or fewer.");
    const actor = await getActiveInternalUserForRoles(managerRoles);

    await prisma.$transaction(async (transaction) => {
      const template = await editableTemplate(transaction, input.templateId);
      if (!await transaction.serviceStage.findUnique({ where: { id: input.serviceStageId }, select: { id: true } })) throw new UserFacingError("Stage not found.");
      const data = {
        serviceStageId: input.serviceStageId,
        label: input.label,
        type: input.type,
        unit: input.type === "READING" ? input.unit || null : null,
        items: input.type === "CHECKLIST" ? input.items : [],
        requiresQa: input.requiresQa,
        isRequired: input.isRequired,
      };
      if (input.stepId) {
        const existing = await transaction.checklistTemplateStep.findFirst({ where: { id: input.stepId, templateId: template.id }, select: { id: true } });
        if (!existing) throw new UserFacingError("Step not found.");
        await transaction.checklistTemplateStep.update({ where: { id: existing.id }, data });
      } else {
        const last = await transaction.checklistTemplateStep.aggregate({ where: { templateId: template.id }, _max: { sequence: true } });
        await transaction.checklistTemplateStep.create({ data: { ...data, templateId: template.id, sequence: (last._max.sequence ?? 0) + 1 } });
      }
      await recordAudit(transaction, { actorUserId: actor.id, eventType: input.stepId ? "checklist-step.updated" : "checklist-step.added", entityType: "ChecklistTemplate", entityId: template.id, metadata: { label: input.label, type: input.type, requiresQa: input.requiresQa, isRequired: input.isRequired } });
    });
    revalidate();
    return input.stepId ? "Step saved." : "Step added.";
  });
}

export async function deleteChecklistStep(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const stepId = id.parse(value(formData, "stepId"));
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const step = await transaction.checklistTemplateStep.findUnique({ where: { id: stepId }, select: { id: true, label: true, templateId: true } });
      if (!step) throw new UserFacingError("Step not found.");
      await editableTemplate(transaction, step.templateId);
      await transaction.checklistTemplateStep.delete({ where: { id: step.id } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "checklist-step.removed", entityType: "ChecklistTemplate", entityId: step.templateId, metadata: { label: step.label } });
    });
    revalidate();
    return "Step removed.";
  });
}

/** Moves a step up or down among the steps of its stage. */
export async function moveChecklistStep(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ stepId: id, direction: z.enum(["up", "down"]) }).parse({ stepId: value(formData, "stepId"), direction: value(formData, "direction") });
    await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const step = await transaction.checklistTemplateStep.findUnique({ where: { id: input.stepId } });
      if (!step) throw new UserFacingError("Step not found.");
      await editableTemplate(transaction, step.templateId);
      const neighbor = await transaction.checklistTemplateStep.findFirst({
        where: { templateId: step.templateId, serviceStageId: step.serviceStageId, sequence: input.direction === "up" ? { lt: step.sequence } : { gt: step.sequence } },
        orderBy: { sequence: input.direction === "up" ? "desc" : "asc" },
      });
      if (!neighbor) return;
      await transaction.checklistTemplateStep.update({ where: { id: step.id }, data: { sequence: neighbor.sequence } });
      await transaction.checklistTemplateStep.update({ where: { id: neighbor.id }, data: { sequence: step.sequence } });
    });
    revalidate();
  });
}

/** Creates the starting checklist (form 852-01-01) on a portal that has none, so it can be reviewed before any job uses it. */
export async function createStartingChecklist(): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await getActiveInternalUserForRoles(managerRoles);
    if (await prisma.checklistTemplate.count() > 0) return;
    const template = await ensureActiveChecklistTemplate(prisma);
    if (template) await recordAudit(prisma, { actorUserId: actor.id, eventType: "checklist-template.created", entityType: "ChecklistTemplate", entityId: template.id, metadata: { formNumber: template.formNumber, revision: template.revision } });
    revalidate();
    return "Checklist created.";
  });
}
