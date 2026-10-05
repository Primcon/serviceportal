import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { assignWorkOrder } from "@/features/assignments/actions";
import { updateWorkOrderStatus } from "@/features/work-orders/actions";
import { getActiveInternalUser } from "@/services/authorization";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };
const userIds: string[] = [];
let companyId = "";
let equipmentId = "";
let meId = "";
let technicianId = "";
let stages: Record<string, { id: string; customerFacingStatus: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED" }> = {};

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

async function workOrder(label: string) {
  return prisma.workOrder.create({ data: { workOrderNumber: `ASG-${label}-${suffix}`, companyId, equipmentId, summary: label, serviceStageId: stages.RECEIVED.id, customerFacingStatus: stages.RECEIVED.customerFacingStatus, createdById: meId, stageEnteredAt: new Date("2026-01-01T00:00:00Z") } });
}

async function staff(label: string, data: { internalRole?: UserRole; isActive?: boolean } = { internalRole: UserRole.VACTECH_SERVICE_USER }) {
  const user = await prisma.user.create({ data: { identitySubject: `assign:${label}:${suffix}`, email: `assign-${label}-${suffix}@test.invalid`, displayName: label, ...data } });
  userIds.push(user.id);
  return user;
}

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
  meId = (await getActiveInternalUser()).id;
  technicianId = (await staff("technician")).id;
  stages = Object.fromEntries((await prisma.serviceStage.findMany()).map((stage) => [stage.code, stage]));
  const company = await prisma.company.create({ data: { name: `Assignment Company ${suffix}` } });
  companyId = company.id;
  equipmentId = (await prisma.equipment.create({ data: { companyId, productModel: "Assignment Model", serialNumber: `ASG-${suffix}` } })).id;
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("handing a work order between people", () => {
  it("lets any staff member take it, hand it off with a note, and return it to the queue", async () => {
    const order = await workOrder("handoff");
    await expect(assignWorkOrder(form({ workOrderId: order.id, assigneeId: "me", note: "" }))).resolves.toEqual({ status: "success", message: "It's yours." });
    await expect(assignWorkOrder(form({ workOrderId: order.id, assigneeId: "me", note: "" }))).resolves.toEqual({ status: "success", message: "No change: it's already there." });
    await expect(assignWorkOrder(form({ workOrderId: order.id, assigneeId: technicianId, note: "Rotor is on bench 3." }))).resolves.toEqual({ status: "success", message: "Handed off." });
    await expect(assignWorkOrder(form({ workOrderId: order.id, assigneeId: "", note: "" }))).resolves.toEqual({ status: "success", message: "Returned to the queue." });

    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } })).assignedToId).toBeNull();
    const history = await prisma.workOrderAssignment.findMany({ where: { workOrderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((entry) => [entry.assignedToId, entry.assignedById, entry.note])).toEqual([[meId, meId, null], [technicianId, meId, "Rotor is on bench 3."], [null, meId, null]]);
    expect(await prisma.auditEvent.count({ where: { workOrderId: order.id, eventType: { in: ["work-order.assigned", "work-order.unassigned"] } } })).toBe(3);
  });

  it("only hands work to active staff", async () => {
    const order = await workOrder("guard");
    const [customer, disabled] = await Promise.all([staff("customer", {}), staff("disabled", { internalRole: UserRole.VACTECH_SERVICE_USER, isActive: false })]);
    const refused = { status: "error", message: "Choose an active staff member to hand this to." };
    await expect(assignWorkOrder(form({ workOrderId: order.id, assigneeId: customer.id, note: "" }))).resolves.toEqual(refused);
    await expect(assignWorkOrder(form({ workOrderId: order.id, assigneeId: disabled.id, note: "" }))).resolves.toEqual(refused);
    expect(await prisma.workOrderAssignment.count({ where: { workOrderId: order.id } })).toBe(0);
  });
});

describe("handing off while changing the stage", () => {
  it("moves the stage, restarts the days-in-stage clock, and hands to the chosen person", async () => {
    const order = await workOrder("stage");
    await assignWorkOrder(form({ workOrderId: order.id, assigneeId: "me", note: "" }));
    await expect(updateWorkOrderStatus(form({ workOrderId: order.id, serviceStageId: stages.INITIAL_INSPECTION.id, condition: "NORMAL", note: "Intake done.", handoff: technicianId }))).resolves.toMatchObject({ status: "success" });

    const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ serviceStageId: stages.INITIAL_INSPECTION.id, assignedToId: technicianId });
    expect(after.stageEnteredAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const handoff = await prisma.workOrderAssignment.findFirstOrThrow({ where: { workOrderId: order.id, assignedToId: technicianId } });
    expect(handoff).toMatchObject({ serviceStageId: stages.INITIAL_INSPECTION.id, note: null });

    // A condition change keeps the owner and the clock.
    await updateWorkOrderStatus(form({ workOrderId: order.id, serviceStageId: stages.INITIAL_INSPECTION.id, condition: "WAITING_ON_PARTS", note: "" }));
    const waiting = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(waiting.assignedToId).toBe(technicianId);
    expect(waiting.stageEnteredAt).toEqual(after.stageEnteredAt);
  });

  it("can hand off without changing the stage, and to the queue", async () => {
    const order = await workOrder("same-stage");
    await expect(updateWorkOrderStatus(form({ workOrderId: order.id, serviceStageId: stages.RECEIVED.id, condition: "NORMAL", note: "Yours from here.", handoff: technicianId }))).resolves.toMatchObject({ status: "success", message: "Service state updated." });
    expect(await prisma.workOrderStatusHistory.count({ where: { workOrderId: order.id } })).toBe(0);
    expect(await prisma.workOrderAssignment.findFirstOrThrow({ where: { workOrderId: order.id } })).toMatchObject({ assignedToId: technicianId, note: "Yours from here." });

    await updateWorkOrderStatus(form({ workOrderId: order.id, serviceStageId: stages.EVALUATION.id, condition: "NORMAL", note: "", handoff: "" }));
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } })).assignedToId).toBeNull();
  });

  it("clears the owner when a job is completed or cancelled", async () => {
    const [completed, cancelled] = await Promise.all([workOrder("completed"), workOrder("cancelled")]);
    await prisma.workOrder.updateMany({ where: { id: { in: [completed.id, cancelled.id] } }, data: { assignedToId: technicianId } });
    await updateWorkOrderStatus(form({ workOrderId: completed.id, serviceStageId: stages.COMPLETED.id, condition: "NORMAL", note: "" }));
    await updateWorkOrderStatus(form({ workOrderId: cancelled.id, serviceStageId: stages.RECEIVED.id, condition: "CANCELLED", note: "Customer withdrew.", handoff: technicianId }));
    const after = await prisma.workOrder.findMany({ where: { id: { in: [completed.id, cancelled.id] } } });
    expect(after.map((order) => order.assignedToId)).toEqual([null, null]);
  });
});
