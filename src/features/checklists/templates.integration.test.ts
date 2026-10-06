import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { activateChecklistTemplate, createChecklistRevision, deleteChecklistStep, moveChecklistStep, saveChecklistStep, saveChecklistTemplate } from "@/features/checklists/template-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const formNumber = `TPL-${suffix}`;
const savedEnvironment = { ...process.env };
let stageId = "";
let otherStageId = "";
let originalId = "";
let previouslyActiveIds: string[] = [];

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

/** createChecklistRevision redirects to the new revision, which Next.js signals by throwing. */
async function newRevision(templateId: string, revision: string) {
  try {
    const result = await createChecklistRevision(form({ templateId, revision }));
    throw new Error(`Expected a redirect, got ${JSON.stringify(result)}`);
  } catch (error) {
    const match = /\/workspace\/checklists\/([0-9a-f-]{36})/.exec((error as { digest?: string }).digest ?? "");
    if (!match) throw error;
    return match[1];
  }
}

const step = (templateId: string, values: Record<string, string>) => saveChecklistStep(form({ templateId, stepId: "", serviceStageId: stageId, type: "SIGN_OFF", unit: "", items: "", isRequired: "on", ...values }));
const labels = async (templateId: string) => (await prisma.checklistTemplateStep.findMany({ where: { templateId }, orderBy: { sequence: "asc" } })).map((item) => item.label);

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
  const stages = await prisma.serviceStage.findMany({ orderBy: { sequence: "asc" }, take: 2 });
  stageId = stages[0].id;
  otherStageId = stages[1].id;
  originalId = (await prisma.checklistTemplate.create({ data: { formNumber, revision: "1", name: "Template test" } })).id;
  previouslyActiveIds = (await prisma.checklistTemplate.findMany({ where: { isActive: true }, select: { id: true } })).map((template) => template.id);
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { workOrderNumber: `TPL-${suffix}` } });
  await prisma.equipment.deleteMany({ where: { serialNumber: `TPL-${suffix}` } });
  await prisma.company.deleteMany({ where: { name: `Template Company ${suffix}` } });
  // A work order another test opened in the moment this test's checklist was active is released first.
  await prisma.workOrderStepRecord.deleteMany({ where: { templateStep: { template: { formNumber } } } });
  await prisma.workOrder.updateMany({ where: { checklistTemplate: { formNumber } }, data: { checklistTemplateId: null } });
  await prisma.checklistTemplate.deleteMany({ where: { formNumber } });
  await prisma.checklistTemplate.updateMany({ where: { id: { in: previouslyActiveIds } }, data: { isActive: true } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("editing a checklist", () => {
  it("adds, edits, reorders and removes steps", async () => {
    await expect(step(originalId, { label: "Teardown" })).resolves.toEqual({ status: "success", message: "Step added." });
    await expect(step(originalId, { label: "Leak check", type: "READING", unit: "mbar·l/s", requiresQa: "on" })).resolves.toMatchObject({ status: "success" });
    await expect(step(originalId, { label: "Inspect", type: "CHECKLIST", items: "Wheels" })).resolves.toEqual({ status: "error", message: "List at least two items, one per line." });
    await expect(step(originalId, { label: "Inspect", type: "CHECKLIST", items: "Wheels\n  Oil leaks \n\nWheels" })).resolves.toMatchObject({ status: "success" });
    expect(await labels(originalId)).toEqual(["Teardown", "Leak check", "Inspect"]);

    const [teardown, leakCheck, inspect] = await prisma.checklistTemplateStep.findMany({ where: { templateId: originalId }, orderBy: { sequence: "asc" } });
    expect(leakCheck).toMatchObject({ type: "READING", unit: "mbar·l/s", requiresQa: true, isRequired: true });
    expect(inspect.items).toEqual(["Wheels", "Oil leaks"]);

    await moveChecklistStep(form({ stepId: inspect.id, direction: "up" }));
    expect(await labels(originalId)).toEqual(["Teardown", "Inspect", "Leak check"]);
    // The first step in a stage has nowhere further up to go.
    await moveChecklistStep(form({ stepId: teardown.id, direction: "up" }));
    expect(await labels(originalId)).toEqual(["Teardown", "Inspect", "Leak check"]);

    // Changing a reading into a plain sign-off drops its unit; unticking Required makes it optional.
    await expect(saveChecklistStep(form({ templateId: originalId, stepId: leakCheck.id, serviceStageId: otherStageId, label: "Leak check done", type: "SIGN_OFF", unit: "mbar·l/s", items: "" }))).resolves.toEqual({ status: "success", message: "Step saved." });
    expect(await prisma.checklistTemplateStep.findUniqueOrThrow({ where: { id: leakCheck.id } })).toMatchObject({ label: "Leak check done", unit: null, serviceStageId: otherStageId, isRequired: false, requiresQa: false });

    await expect(deleteChecklistStep(form({ stepId: inspect.id }))).resolves.toEqual({ status: "success", message: "Step removed." });
    expect(await labels(originalId)).toEqual(["Teardown", "Leak check done"]);
  });

  it("locks a revision once a work order uses it, and carries changes into a new revision", async () => {
    const stage = await prisma.serviceStage.findUniqueOrThrow({ where: { id: stageId } });
    const creator = await prisma.user.findFirstOrThrow({ where: { identitySubject: "development:service-manager" } });
    const company = await prisma.company.create({ data: { name: `Template Company ${suffix}` } });
    const equipment = await prisma.equipment.create({ data: { companyId: company.id, productModel: "Template Model", serialNumber: `TPL-${suffix}` } });
    await prisma.workOrder.create({ data: { workOrderNumber: `TPL-${suffix}`, companyId: company.id, equipmentId: equipment.id, summary: "Uses revision 1", serviceStageId: stage.id, customerFacingStatus: stage.customerFacingStatus, createdById: creator.id, checklistTemplateId: originalId } });

    const locked = { status: "error", message: "Work orders already use this revision, so it can't be changed. Create a new revision instead." };
    const existing = await prisma.checklistTemplateStep.findFirstOrThrow({ where: { templateId: originalId } });
    await expect(step(originalId, { label: "Late addition" })).resolves.toEqual(locked);
    await expect(deleteChecklistStep(form({ stepId: existing.id }))).resolves.toEqual(locked);
    await expect(saveChecklistTemplate(form({ templateId: originalId, formNumber, revision: "1a", name: "Renamed" }))).resolves.toEqual(locked);

    await expect(createChecklistRevision(form({ templateId: originalId, revision: "1" }))).resolves.toEqual({ status: "error", message: `Form ${formNumber} Rev. 1 already exists.` });
    const revisionId = await newRevision(originalId, "2");
    expect(await labels(revisionId)).toEqual(await labels(originalId));
    await expect(step(revisionId, { label: "Added in revision 2" })).resolves.toMatchObject({ status: "success" });
    expect(await labels(originalId)).not.toContain("Added in revision 2");

    // Making it active switches new work orders over; the job already open keeps revision 1.
    await expect(activateChecklistTemplate(form({ templateId: revisionId }))).resolves.toMatchObject({ status: "success" });
    expect(await prisma.checklistTemplate.findMany({ where: { isActive: true }, select: { id: true } })).toEqual([{ id: revisionId }]);
    expect((await prisma.workOrder.findFirstOrThrow({ where: { workOrderNumber: `TPL-${suffix}` } })).checklistTemplateId).toBe(originalId);
    // Hand the active slot straight back, so tests running alongside open their work orders on the real checklist.
    await prisma.$transaction([
      prisma.checklistTemplate.update({ where: { id: revisionId }, data: { isActive: false } }),
      prisma.checklistTemplate.updateMany({ where: { id: { in: previouslyActiveIds } }, data: { isActive: true } }),
    ]);
  });

  it("won't activate an empty checklist, and is limited to managers and administrators", async () => {
    const empty = await prisma.checklistTemplate.create({ data: { formNumber, revision: "empty", name: "Empty" } });
    await expect(activateChecklistTemplate(form({ templateId: empty.id }))).resolves.toEqual({ status: "error", message: "Add at least one step before making this checklist active." });

    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_QA;
    try {
      const denied = { status: "error", message: "You don't have permission to do that." };
      await expect(step(empty.id, { label: "Blocked" })).resolves.toEqual(denied);
      await expect(activateChecklistTemplate(form({ templateId: empty.id }))).resolves.toEqual(denied);
      await expect(createChecklistRevision(form({ templateId: empty.id, revision: "9" }))).resolves.toEqual(denied);
    } finally {
      process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    }
  });
});
