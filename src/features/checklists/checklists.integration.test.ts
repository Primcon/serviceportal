import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { clearChecklistStep, signChecklistStep, startChecklist } from "@/features/checklists/actions";
import { getWorkOrderChecklist, initials } from "@/features/checklists/checklist";
import { updateWorkOrderStatus } from "@/features/work-orders/actions";
import { getActiveInternalUser } from "@/services/authorization";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };
let companyId = "";
let equipmentId = "";
let templateId = "";
let meId = "";
let colleagueId = "";
let stages: Record<string, { id: string; customerFacingStatus: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED" }> = {};
const steps: Record<string, string> = {};

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

function as(role: UserRole) {
  process.env.DEVELOPMENT_INTERNAL_ROLE = role;
}

async function workOrder(label: string, stage = "INTAKE_DOCUMENTATION", withChecklist = true) {
  return prisma.workOrder.create({ data: { workOrderNumber: `CHK-${label}-${suffix}`, companyId, equipmentId, summary: label, serviceStageId: stages[stage].id, customerFacingStatus: stages[stage].customerFacingStatus, createdById: meId, checklistTemplateId: withChecklist ? templateId : null } });
}

const sign = (workOrderId: string, step: string, extra: Record<string, string> = {}) => signChecklistStep(form({ workOrderId, stepId: steps[step], ...extra }));
const move = (workOrderId: string, stage: string, extra: Record<string, string> = {}) => updateWorkOrderStatus(form({ workOrderId, serviceStageId: stages[stage].id, condition: "NORMAL", note: "", ...extra }));

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  as(UserRole.VACTECH_SERVICE_USER);
  meId = (await getActiveInternalUser()).id;
  stages = Object.fromEntries((await prisma.serviceStage.findMany()).map((stage) => [stage.code, stage]));
  const company = await prisma.company.create({ data: { name: `Checklist Company ${suffix}` } });
  companyId = company.id;
  equipmentId = (await prisma.equipment.create({ data: { companyId, productModel: "Checklist Model", serialNumber: `CHK-${suffix}` } })).id;
  colleagueId = (await prisma.user.create({ data: { identitySubject: `checklist:colleague:${suffix}`, email: `checklist-${suffix}@test.invalid`, displayName: "Casey Colleague", internalRole: UserRole.VACTECH_SERVICE_USER } })).id;

  // A small checklist of its own, so the test doesn't depend on how the real one is edited.
  const template = await prisma.checklistTemplate.create({
    data: {
      formNumber: `TEST-${suffix}`,
      revision: "1",
      name: "Test checklist",
      steps: { create: [
        { serviceStageId: stages.INTAKE_DOCUMENTATION.id, sequence: 1, label: "Visual inspection" },
        { serviceStageId: stages.INTAKE_DOCUMENTATION.id, sequence: 2, label: "Optional photo of crate", isRequired: false },
        { serviceStageId: stages.INITIAL_INSPECTION.id, sequence: 3, label: "Leak check", type: "READING", unit: "mbar·l/s" },
        { serviceStageId: stages.INITIAL_INSPECTION.id, sequence: 4, label: "Inspect as applicable", type: "CHECKLIST", items: ["Motor wiring", "Oil leaks", "Wheels"] },
        { serviceStageId: stages.TESTING.id, sequence: 5, label: "Test results", requiresQa: true },
      ] },
    },
    include: { steps: true },
  });
  templateId = template.id;
  for (const step of template.steps) steps[step.label] = step.id;
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.checklistTemplate.deleteMany({ where: { id: templateId } });
  await prisma.user.deleteMany({ where: { id: colleagueId } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("initials", () => {
  it("writes them the way the paper form has them", () => {
    expect(initials("Jordan Lee")).toBe("JL");
    expect(initials("  maria de la cruz ")).toBe("MC");
    expect(initials("Cher")).toBe("CH");
    expect(initials("")).toBe("?");
  });
});

describe("signing checklist steps", () => {
  it("records who signed, with the reading or item results the step asks for", async () => {
    as(UserRole.VACTECH_SERVICE_USER);
    const order = await workOrder("sign");
    await expect(sign(order.id, "Visual inspection")).resolves.toEqual({ status: "success", message: "Signed." });
    await expect(sign(order.id, "Visual inspection")).resolves.toMatchObject({ status: "error", message: expect.stringContaining("already signed") });

    await expect(sign(order.id, "Leak check")).resolves.toEqual({ status: "error", message: "Enter the reading in mbar·l/s." });
    await expect(sign(order.id, "Leak check", { reading: "2.1e-9" })).resolves.toMatchObject({ status: "success" });

    await expect(sign(order.id, "Inspect as applicable", { "item:0": "done", "item:2": "na" })).resolves.toEqual({ status: "error", message: "Mark each item done or N/A. Still open: Oil leaks." });
    await expect(sign(order.id, "Inspect as applicable", { "item:0": "done", "item:1": "done", "item:2": "na" })).resolves.toMatchObject({ status: "success" });

    const checklist = await getWorkOrderChecklist(order.id, templateId);
    const record = (label: string) => checklist!.steps.find((step) => step.label === label)!.record;
    expect(record("Visual inspection")).toMatchObject({ performedById: meId, notApplicable: false });
    expect(record("Leak check")).toMatchObject({ reading: "2.1e-9" });
    expect(record("Inspect as applicable")).toMatchObject({ checkedItems: ["Motor wiring", "Oil leaks"], notApplicableItems: ["Wheels"] });
    expect(record("Test results")).toBeNull();
    expect(await prisma.auditEvent.count({ where: { workOrderId: order.id, eventType: "checklist-step.signed" } })).toBe(3);
  });

  it("keeps QA steps for QA, managers and administrators", async () => {
    const order = await workOrder("qa");
    as(UserRole.VACTECH_SERVICE_USER);
    await expect(sign(order.id, "Test results")).resolves.toEqual({ status: "error", message: "This step needs a quality assurance sign-off." });
    as(UserRole.VACTECH_QA);
    await expect(sign(order.id, "Test results")).resolves.toEqual({ status: "success", message: "Signed." });
  });

  it("marks a step not applicable only with a reason", async () => {
    as(UserRole.VACTECH_SERVICE_USER);
    const order = await workOrder("na");
    await expect(sign(order.id, "Leak check", { notApplicable: "true" })).resolves.toEqual({ status: "error", message: "Say why this step doesn't apply." });
    await expect(sign(order.id, "Leak check", { notApplicable: "true", note: "Dry pump, no oil circuit." })).resolves.toEqual({ status: "success", message: "Marked not applicable." });
    expect(await prisma.workOrderStepRecord.findFirstOrThrow({ where: { workOrderId: order.id } })).toMatchObject({ notApplicable: true, reading: null, note: "Dry pump, no oil circuit." });
  });

  it("lets the signer or a manager clear a sign-off, and nobody change a closed job", async () => {
    const order = await workOrder("clear");
    await prisma.workOrderStepRecord.create({ data: { workOrderId: order.id, templateStepId: steps["Visual inspection"], performedById: colleagueId } });
    as(UserRole.VACTECH_SERVICE_USER);
    await expect(clearChecklistStep(form({ workOrderId: order.id, stepId: steps["Visual inspection"] }))).resolves.toEqual({ status: "error", message: "Only the person who signed this step or a manager can clear it." });
    as(UserRole.VACTECH_MANAGER);
    await expect(clearChecklistStep(form({ workOrderId: order.id, stepId: steps["Visual inspection"] }))).resolves.toEqual({ status: "success", message: "Sign-off cleared." });
    expect(await prisma.workOrderStepRecord.count({ where: { workOrderId: order.id } })).toBe(0);

    await prisma.workOrder.update({ where: { id: order.id }, data: { completedAt: new Date() } });
    await expect(sign(order.id, "Visual inspection")).resolves.toMatchObject({ status: "error", message: expect.stringContaining("closed") });
  });

  it("refuses a step from another checklist, and starts a checklist on an older job", async () => {
    as(UserRole.VACTECH_SERVICE_USER);
    const order = await workOrder("older", "INTAKE_DOCUMENTATION", false);
    await expect(sign(order.id, "Visual inspection")).resolves.toEqual({ status: "error", message: "That step isn't on this job's checklist." });
    await expect(startChecklist(form({ workOrderId: order.id }))).resolves.toEqual({ status: "success", message: "Checklist started." });
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } })).checklistTemplateId).not.toBeNull();
  });
});

describe("moving a job on", () => {
  it("is held until the required steps of the earlier stages are signed", async () => {
    as(UserRole.VACTECH_SERVICE_USER);
    const order = await workOrder("gate");
    // Leaving a stage needs that stage's required steps. The optional one doesn't hold it up.
    await expect(move(order.id, "INITIAL_INSPECTION")).resolves.toEqual({ status: "error", message: "Sign this step first: Visual inspection. A manager can override." });
    await sign(order.id, "Visual inspection");
    await expect(move(order.id, "INITIAL_INSPECTION")).resolves.toMatchObject({ status: "success" });

    // Skipping ahead still needs the steps of every stage passed over.
    await expect(move(order.id, "REPAIR_IN_PROGRESS")).resolves.toEqual({ status: "error", message: "Sign these steps first: Leak check; Inspect as applicable. A manager can override." });
    // Going back, putting the job on hold, or cancelling it is never held up.
    await expect(move(order.id, "INTAKE_DOCUMENTATION")).resolves.toMatchObject({ status: "success" });
    await expect(updateWorkOrderStatus(form({ workOrderId: order.id, serviceStageId: stages.TESTING.id, condition: "CANCELLED", note: "" }))).resolves.toMatchObject({ status: "success" });
  });

  it("lets a manager override with a reason, and records it", async () => {
    const order = await workOrder("override");
    as(UserRole.VACTECH_MANAGER);
    await expect(move(order.id, "INITIAL_INSPECTION")).resolves.toEqual({ status: "error", message: "A required step is unsigned: Visual inspection. To move on anyway, give an override reason." });
    await expect(move(order.id, "INITIAL_INSPECTION", { overrideReason: "Signed on the paper traveler; scan to follow." })).resolves.toMatchObject({ status: "success" });

    const history = await prisma.workOrderStatusHistory.findFirstOrThrow({ where: { workOrderId: order.id } });
    expect(history.overrideReason).toBe("Signed on the paper traveler; scan to follow.");
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { workOrderId: order.id, eventType: "checklist.overridden" } });
    expect(audit.metadata).toMatchObject({ unsignedSteps: ["Visual inspection"], movedTo: "Initial Inspection" });

    // A reason given when nothing is unsigned isn't stored as an override.
    await prisma.workOrderStepRecord.createMany({ data: ["Visual inspection", "Leak check", "Inspect as applicable"].map((label) => ({ workOrderId: order.id, templateStepId: steps[label], performedById: meId })) });
    await move(order.id, "REPAIR_IN_PROGRESS", { overrideReason: "Not needed" });
    expect((await prisma.workOrderStatusHistory.findFirstOrThrow({ where: { workOrderId: order.id, serviceStageId: stages.REPAIR_IN_PROGRESS.id } })).overrideReason).toBeNull();
  });
});
