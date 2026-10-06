import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { listAuditEvents } from "@/features/audit/queries";
import { operationsDashboard } from "@/features/dashboard/queries";

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
let actorId = "";
let otherActorId = "";
let companyId = "";
let workOrderId = "";

const mine = async (filters: Parameters<typeof listAuditEvents>[0]) => (await listAuditEvents({ search: `AUD-${suffix}`, ...filters })).events.map((event) => event.eventType).sort();

beforeAll(async () => {
  const [actor, other] = await Promise.all(["actor", "other"].map((label) => prisma.user.create({ data: { identitySubject: `audit:${label}:${suffix}`, email: `audit-${label}-${suffix}@test.invalid`, displayName: `Audit ${label} ${suffix}`, internalRole: "VACTECH_SERVICE_USER" } })));
  actorId = actor.id;
  otherActorId = other.id;
  const stage = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "TESTING" } });
  const company = await prisma.company.create({ data: { name: `Audit Company ${suffix}` } });
  companyId = company.id;
  const equipment = await prisma.equipment.create({ data: { companyId, productModel: "Audit Model", serialNumber: `AUD-${suffix}` } });
  const workOrder = await prisma.workOrder.create({
    data: { workOrderNumber: `AUD-${suffix}`, companyId, equipmentId: equipment.id, summary: "Audit test", serviceStageId: stage.id, customerFacingStatus: stage.customerFacingStatus, createdById: actor.id, assignedToId: actor.id, receivedAt: new Date(Date.now() - 40 * 86_400_000), promisedAt: new Date("2020-01-01T00:00:00Z"), stageEnteredAt: new Date(Date.now() - 3 * 86_400_000) },
  });
  workOrderId = workOrder.id;
  const event = (eventType: string, actorUserId: string, createdAt: string) => ({ workOrderId, actorUserId, eventType, entityType: "WorkOrder", entityId: workOrderId, createdAt: new Date(createdAt) });
  await prisma.auditEvent.createMany({ data: [
    event("work-order.details-updated", actor.id, "2026-03-10T18:00:00Z"),
    event("checklist-step.signed", actor.id, "2026-03-11T18:00:00Z"),
    event("checklist.overridden", other.id, "2026-03-12T18:00:00Z"),
    // 11:30 pm on 12 March in Phoenix, which is already 13 March in UTC.
    event("photo.uploaded", other.id, "2026-03-13T06:30:00Z"),
  ] });
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { id: { in: [actorId, otherActorId] } } });
  await prisma.$disconnect();
});

describe("the audit log's filters", () => {
  it("finds a work order's events by its number, newest first", async () => {
    const { events, total } = await listAuditEvents({ search: `aud-${suffix}` });
    expect(total).toBe(4);
    expect(events[0]).toMatchObject({ eventType: "photo.uploaded", workOrder: { id: workOrderId, workOrderNumber: `AUD-${suffix}` } });
  });

  it("narrows by kind of activity, person, overrides and date", async () => {
    expect(await mine({ category: "checklist" })).toEqual(["checklist-step.signed", "checklist.overridden"]);
    expect(await mine({ category: "files" })).toEqual(["photo.uploaded"]);
    expect(await mine({ actorId })).toEqual(["checklist-step.signed", "work-order.details-updated"]);
    expect(await mine({ overridesOnly: true })).toEqual(["checklist.overridden"]);
    // Days are the shop's days: the late-evening photo belongs to 12 March, not 13 March.
    expect(await mine({ from: "2026-03-12", to: "2026-03-12" })).toEqual(["checklist.overridden", "photo.uploaded"]);
    expect(await mine({ from: "2026-03-13" })).toEqual([]);
    expect(await mine({ to: "not-a-date", from: "2026-03-11" })).toEqual(["checklist-step.signed", "checklist.overridden", "photo.uploaded"]);
  });

  it("also searches by person", async () => {
    const { total } = await listAuditEvents({ search: `Audit other ${suffix}` });
    expect(total).toBe(2);
  });
});

describe("the operations dashboard", () => {
  it("counts an open, overdue, month-old job in the right places", async () => {
    const dashboard = await operationsDashboard();
    expect(dashboard.totals.open).toBeGreaterThanOrEqual(1);
    expect(dashboard.totals.overdue).toBeGreaterThanOrEqual(1);
    expect(dashboard.byStage.find((stage) => stage.name === "Testing")!.count).toBeGreaterThanOrEqual(1);
    expect(dashboard.byStage.some((stage) => stage.name === "Completed")).toBe(false);
    expect(dashboard.aging.at(-1)!.count).toBeGreaterThanOrEqual(1);
    expect(dashboard.workload.find((person) => person.id === actorId)).toMatchObject({ name: `Audit actor ${suffix}`, count: 1, overdue: 1 });
    expect(dashboard.weekly).toHaveLength(8);
  });
});
