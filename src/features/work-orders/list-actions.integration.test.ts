import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { PrismaClient, UserRole } from "@prisma/client";
import { GET as exportList } from "@/app/workspace/work-orders/export/route";
import { bulkUpdateWorkOrders, deleteWorkOrderFilter, saveWorkOrderFilter } from "@/features/work-orders/list-actions";
import { filterQuery, readWorkOrderFilters } from "@/features/work-orders/list-filters";
import { getActiveInternalUser } from "@/services/authorization";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };
let companyId = "";
let equipmentId = "";
let meId = "";
let technicianId = "";
let stages: Record<string, { id: string; customerFacingStatus: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED" }> = {};

function form(values: Record<string, string | string[]>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const each of Array.isArray(value) ? value : [value]) formData.append(key, each);
  }
  return formData;
}

function workOrder(label: string) {
  return prisma.workOrder.create({ data: { workOrderNumber: `LIST-${label}-${suffix}`, companyId, equipmentId, summary: label, serviceStageId: stages.RECEIVED.id, customerFacingStatus: stages.RECEIVED.customerFacingStatus, createdById: meId } });
}

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
  meId = (await getActiveInternalUser()).id;
  technicianId = (await prisma.user.create({ data: { identitySubject: `list:tech:${suffix}`, email: `list-tech-${suffix}@test.invalid`, displayName: "List Technician", internalRole: UserRole.VACTECH_SERVICE_USER } })).id;
  stages = Object.fromEntries((await prisma.serviceStage.findMany()).map((stage) => [stage.code, stage]));
  companyId = (await prisma.company.create({ data: { name: `List Company ${suffix}` } })).id;
  equipmentId = (await prisma.equipment.create({ data: { companyId, productModel: "List Model", serialNumber: `LIST-${suffix}` } })).id;
});

afterAll(async () => {
  await prisma.savedFilter.deleteMany({ where: { userId: meId, name: { contains: suffix } } });
  await prisma.notification.deleteMany({ where: { workOrder: { companyId } } });
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { id: technicianId } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("the work order list's filters", () => {
  it("keep only the filters the list understands, without paging", () => {
    expect(filterQuery({ assignee: "me", open: "1", page: "3", evil: "x", search: "  48366 " })).toBe("search=48366&assignee=me&open=1");
    const read = readWorkOrderFilters({ company: companyId, stage: "not-a-uuid", overdue: "1" }, meId);
    expect(read).toMatchObject({ companyId, stageId: "", overdueOnly: true, filtersApplied: true });
  });

  it("can be saved under a name, replaced, and removed only by their owner", async () => {
    const name = `Rush ${suffix}`;
    await expect(saveWorkOrderFilter(form({ name, query: "priority=Rush&page=2" }))).resolves.toEqual({ status: "success", message: `"${name}" saved.` });
    await expect(saveWorkOrderFilter(form({ name, query: "priority=Rush&open=1" }))).resolves.toEqual({ status: "success", message: `"${name}" updated.` });
    const saved = await prisma.savedFilter.findUniqueOrThrow({ where: { userId_name: { userId: meId, name } } });
    expect(saved.query).toBe("priority=Rush&open=1");
    await expect(saveWorkOrderFilter(form({ name: `Empty ${suffix}`, query: "page=2" }))).resolves.toEqual({ status: "error", message: "Choose some filters first, then save them." });

    // Someone else's filter can't be removed.
    const theirs = await prisma.savedFilter.create({ data: { userId: technicianId, name: `Theirs ${suffix}`, query: "open=1" } });
    await deleteWorkOrderFilter(form({ filterId: theirs.id }));
    expect(await prisma.savedFilter.count({ where: { id: theirs.id } })).toBe(1);
    await deleteWorkOrderFilter(form({ filterId: saved.id }));
    expect(await prisma.savedFilter.count({ where: { id: saved.id } })).toBe(0);
    await prisma.savedFilter.delete({ where: { id: theirs.id } });
  });
});

describe("changing several jobs at once", () => {
  it("hands them all to someone, recording and notifying each one", async () => {
    const [first, second] = await Promise.all([workOrder("bulk-a"), workOrder("bulk-b")]);
    await expect(bulkUpdateWorkOrders(form({ ids: [first.id, second.id], operation: "handoff", assigneeId: technicianId, serviceStageId: "", note: "End of shift.", overrideReason: "" }))).resolves.toEqual({ status: "success", message: "Done for 2 jobs." });
    const after = await prisma.workOrder.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(after.map((order) => order.assignedToId)).toEqual([technicianId, technicianId]);
    expect(await prisma.workOrderAssignment.count({ where: { workOrderId: { in: [first.id, second.id] }, note: "End of shift." } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: technicianId, workOrderId: { in: [first.id, second.id] } } })).toBe(2);
  });

  it("moves each through the usual checks and lists any that can't move", async () => {
    const [ready, blocked] = await Promise.all([workOrder("bulk-ready"), workOrder("bulk-blocked")]);
    await prisma.attachment.create({ data: { workOrderId: ready.id, kind: "DOCUMENT", documentType: "SIGNED_TRAVELER", originalStorageKey: `test/${suffix}/traveler`, fileName: "traveler.pdf", mimeType: "application/pdf", sizeBytes: 1, uploadedById: meId } });
    const result = await bulkUpdateWorkOrders(form({ ids: [ready.id, blocked.id], operation: "stage", assigneeId: "", serviceStageId: stages.COMPLETED.id, note: "", overrideReason: "" }));
    expect(result).toMatchObject({ status: "error", message: expect.stringMatching(new RegExp(`^Done for 1\\. Not changed: LIST-bulk-blocked-${suffix}: Upload the signed traveler first`)) });
    const after = Object.fromEntries((await prisma.workOrder.findMany({ where: { id: { in: [ready.id, blocked.id] } } })).map((order) => [order.id, order.serviceStageId]));
    expect(after[ready.id]).toBe(stages.COMPLETED.id);
    expect(after[blocked.id]).toBe(stages.RECEIVED.id);
    await prisma.attachment.deleteMany({ where: { workOrderId: ready.id } });
  });

  it("needs jobs and a stage", async () => {
    await expect(bulkUpdateWorkOrders(form({ operation: "handoff", assigneeId: "me", serviceStageId: "", note: "", overrideReason: "" }))).resolves.toMatchObject({ status: "error" });
    const order = await workOrder("bulk-nostage");
    await expect(bulkUpdateWorkOrders(form({ ids: [order.id], operation: "stage", assigneeId: "", serviceStageId: "", note: "", overrideReason: "" }))).resolves.toEqual({ status: "error", message: "Choose the stage to move them to." });
  });
});

describe("downloading the list", () => {
  it("gives a spreadsheet of what the filters show, and records it", async () => {
    await workOrder("export");
    const response = await exportList(new Request(`http://localhost/workspace/work-orders/export?company=${companyId}&search=LIST-export`));
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.getWorksheet("Work orders")!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(1).value).toBe(`LIST-export-${suffix}`);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { actorUserId: meId, eventType: "report.exported" }, orderBy: { createdAt: "desc" } });
    expect(audit.metadata).toMatchObject({ reportType: "WORK_ORDER_LIST", rowCount: 1 });
  });
});
