import { UserRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Roles that may sign the steps reserved for quality assurance. */
export const qaSignerRoles: UserRole[] = [UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER, UserRole.VACTECH_QA];

export function canSignQaSteps(role: UserRole) {
  return qaSignerRoles.includes(role);
}

/** A person's initials as they'd write them on the paper form: "Jordan Lee" is "JL". */
export function initials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter((word) => /^[\p{L}\p{N}]/u.test(word));
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** A work order's checklist: its template, the steps in order with their stage, and what's been signed. */
export async function getWorkOrderChecklist(workOrderId: string, checklistTemplateId: string | null) {
  if (!checklistTemplateId) return null;
  const [template, records] = await Promise.all([
    prisma.checklistTemplate.findUnique({
      where: { id: checklistTemplateId },
      select: {
        id: true,
        formNumber: true,
        revision: true,
        name: true,
        steps: {
          orderBy: [{ serviceStage: { sequence: "asc" } }, { sequence: "asc" }],
          select: { id: true, label: true, type: true, unit: true, items: true, requiresQa: true, isRequired: true, serviceStage: { select: { id: true, displayName: true, sequence: true } } },
        },
      },
    }),
    prisma.workOrderStepRecord.findMany({
      where: { workOrderId },
      select: { templateStepId: true, performedById: true, performedAt: true, notApplicable: true, reading: true, checkedItems: true, notApplicableItems: true, note: true, performedBy: { select: { displayName: true } } },
    }),
  ]);
  if (!template) return null;
  const recordByStep = new Map(records.map((record) => [record.templateStepId, record]));
  return { ...template, steps: template.steps.map((step) => ({ ...step, record: recordByStep.get(step.id) ?? null })) };
}

export type WorkOrderChecklist = NonNullable<Awaited<ReturnType<typeof getWorkOrderChecklist>>>;

/**
 * The required steps that must be signed before a job can enter the given stage: every
 * required step belonging to an earlier stage that hasn't been signed yet.
 */
export async function unsignedStepsBefore(transaction: Prisma.TransactionClient, workOrder: { id: string; checklistTemplateId: string | null }, targetStageSequence: number) {
  if (!workOrder.checklistTemplateId) return [];
  return transaction.checklistTemplateStep.findMany({
    where: {
      templateId: workOrder.checklistTemplateId,
      isRequired: true,
      serviceStage: { sequence: { lt: targetStageSequence } },
      records: { none: { workOrderId: workOrder.id } },
    },
    orderBy: [{ serviceStage: { sequence: "asc" } }, { sequence: "asc" }],
    select: { label: true, serviceStage: { select: { displayName: true } } },
  });
}
