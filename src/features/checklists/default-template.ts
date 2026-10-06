import { ChecklistStepType, Prisma, type PrismaClient } from "@prisma/client";
import { ensureInitialStages } from "@/features/work-orders/initial-stages";

type StepDefinition = { stage: string; label: string; type?: ChecklistStepType; unit?: string; items?: string[]; requiresQa?: boolean };

/**
 * The steps of job order form 852-01-01 Rev. 9, placed in the workflow stage where each is
 * done. This is the starting point only: VacTech edits the checklist in the portal, and the
 * QA requirements here are a first guess to be confirmed. The parts and quote lines of the
 * form are tracked separately on the work order.
 */
export const defaultChecklist = {
  formNumber: "852-01-01",
  revision: "9",
  name: "Vacuum Pump Repair Job Order / Inspection Form",
  steps: [
    { stage: "INTAKE_DOCUMENTATION", label: "Oil type and weight recorded" },
    { stage: "INTAKE_DOCUMENTATION", label: "Initial visual inspection and digital pictures" },
    { stage: "INITIAL_INSPECTION", label: "Desystemized" },
    { stage: "INITIAL_INSPECTION", label: "Teardown" },
    { stage: "INITIAL_INSPECTION", label: "Decontamination" },
    { stage: "INITIAL_INSPECTION", label: "Internal pump inspection" },
    { stage: "REPAIR_IN_PROGRESS", label: "Pump rebuild" },
    { stage: "REPAIR_IN_PROGRESS", label: "He leak check (pump)", type: ChecklistStepType.READING, unit: "mbar·l/s" },
    { stage: "REPAIR_IN_PROGRESS", label: "Pump systems completed" },
    { stage: "TESTING", label: "He leak check (system)", type: ChecklistStepType.READING, unit: "mbar·l/s" },
    { stage: "TESTING", label: "Test results completed", requiresQa: true },
    { stage: "FINAL_INSPECTION", label: "Thermal snap switch connections and wiring harness" },
    { stage: "FINAL_INSPECTION", label: "Water fittings at 90 psi", requiresQa: true },
    { stage: "FINAL_INSPECTION", label: "Inspect, as applicable", type: ChecklistStepType.CHECKLIST, requiresQa: true, items: ["Motor wiring", "Motor box cover", "Oil drainage", "Oil leaks", "Accessories", "Thermal snap switch", "Wheels"] },
    { stage: "FINAL_INSPECTION", label: "Finish", type: ChecklistStepType.CHECKLIST, items: ["Wipe down", "Paint (as applicable)", "Stickers", "Tags"] },
  ] satisfies StepDefinition[],
};

/**
 * The checklist new work orders use. On a database with no checklist at all (a new
 * environment), the default one is created first.
 */
export async function ensureActiveChecklistTemplate(client: PrismaClient) {
  const active = await client.checklistTemplate.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  if (active || await client.checklistTemplate.count() > 0) return active;

  await ensureInitialStages(client);
  const stages = new Map((await client.serviceStage.findMany({ select: { id: true, code: true } })).map((stage) => [stage.code, stage.id]));
  try {
    return await client.checklistTemplate.create({
      data: {
        formNumber: defaultChecklist.formNumber,
        revision: defaultChecklist.revision,
        name: defaultChecklist.name,
        isActive: true,
        steps: {
          create: defaultChecklist.steps.filter((step) => stages.has(step.stage)).map((step: StepDefinition, index) => ({
            serviceStageId: stages.get(step.stage)!,
            sequence: index + 1,
            label: step.label,
            type: step.type ?? ChecklistStepType.SIGN_OFF,
            unit: step.unit ?? null,
            items: step.items ?? [],
            requiresQa: step.requiresQa ?? false,
          })),
        },
      },
    });
  } catch (error) {
    // Another request created it at the same moment.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return client.checklistTemplate.findFirst({ where: { isActive: true } });
    }
    throw error;
  }
}
