import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { mergeCompanies, mergeEquipment, setCompanyArchived, setEquipmentArchived, setLocationArchived, updateCompany, updateEquipment, updateLocation } from "@/features/records/actions";
import { getActiveInternalUserForRoles } from "@/services/authorization";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };
const companyIds: string[] = [];
const userIds: string[] = [];
let staffId = "";
let stage: { id: string; customerFacingStatus: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED" };

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

async function company(label: string) {
  const created = await prisma.company.create({ data: { name: `${label} ${suffix}` } });
  companyIds.push(created.id);
  return created;
}

function pump(companyId: string, serialNumber: string, extra: { locationId?: string; description?: string } = {}) {
  return prisma.equipment.create({ data: { companyId, productModel: "Records Model", serialNumber: `${serialNumber}-${suffix}`, ...extra } });
}

function workOrder(companyId: string, equipmentId: string, label: string, extra: { locationId?: string; completedAt?: Date } = {}) {
  return prisma.workOrder.create({ data: { workOrderNumber: `REC-${label}-${suffix}`, companyId, equipmentId, summary: label, serviceStageId: stage.id, customerFacingStatus: stage.customerFacingStatus, createdById: staffId, ...extra } });
}

async function customerUser(label: string) {
  const user = await prisma.user.create({ data: { identitySubject: `records:${label}:${suffix}`, email: `records-${label}-${suffix}@test.invalid`, displayName: label } });
  userIds.push(user.id);
  return user;
}

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
  staffId = (await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER])).id;
  stage = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.userAccess.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.equipment.updateMany({ where: { companyId: { in: companyIds } }, data: { mergedIntoId: null } });
  await prisma.equipment.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.location.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.updateMany({ where: { id: { in: companyIds } }, data: { mergedIntoId: null } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.productModel.deleteMany({ where: { name: `Catalog ${suffix}` } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("editing and archiving customers and locations", () => {
  it("renames a customer but refuses a name another active customer has", async () => {
    const first = await company("Rename First");
    const second = await company("Rename Second");
    await expect(updateCompany(form({ companyId: first.id, name: `Renamed ${suffix}` }))).resolves.toEqual({ status: "success", message: "Customer saved." });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: first.id } })).name).toBe(`Renamed ${suffix}`);
    await expect(updateCompany(form({ companyId: second.id, name: `RENAMED ${suffix}` }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("merge them instead") });
  });

  it("won't archive a customer or pump with an open work order, and restores afterwards", async () => {
    const busy = await company("Busy");
    const equipment = await pump(busy.id, "BUSY");
    const open = await workOrder(busy.id, equipment.id, "open");
    await expect(setCompanyArchived(form({ companyId: busy.id, archived: "true" }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("1 open work order") });
    await expect(setEquipmentArchived(form({ equipmentId: equipment.id, archived: "true" }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("open work order") });

    await prisma.workOrder.update({ where: { id: open.id }, data: { completedAt: new Date() } });
    await expect(setEquipmentArchived(form({ equipmentId: equipment.id, archived: "true" }))).resolves.toEqual({ status: "success", message: "Pump archived." });
    await expect(setCompanyArchived(form({ companyId: busy.id, archived: "true" }))).resolves.toEqual({ status: "success", message: "Customer archived." });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: busy.id } })).archivedAt).not.toBeNull();
    await expect(setCompanyArchived(form({ companyId: busy.id, archived: "false" }))).resolves.toEqual({ status: "success", message: "Customer restored." });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: busy.id } })).archivedAt).toBeNull();
  });

  it("edits and archives a location, keeping names unique within the customer", async () => {
    const owner = await company("Location Owner");
    const [dock, lab] = await Promise.all([
      prisma.location.create({ data: { companyId: owner.id, name: "Dock" } }),
      prisma.location.create({ data: { companyId: owner.id, name: "Lab" } }),
    ]);
    await expect(updateLocation(form({ locationId: dock.id, name: "lab", addressLine: "", city: "", region: "", postalCode: "", country: "" }))).resolves.toMatchObject({ status: "error", message: "This customer already has a location with that name." });
    await expect(updateLocation(form({ locationId: dock.id, name: "Dock 2", addressLine: "1 Main St", city: "Chandler", region: "AZ", postalCode: "", country: "" }))).resolves.toEqual({ status: "success", message: "Location saved." });
    expect(await prisma.location.findUniqueOrThrow({ where: { id: dock.id } })).toMatchObject({ name: "Dock 2", city: "Chandler", region: "AZ", postalCode: null });
    await expect(setLocationArchived(form({ locationId: lab.id, archived: "true" }))).resolves.toEqual({ status: "success", message: "Location archived." });
    expect((await prisma.location.findUniqueOrThrow({ where: { id: lab.id } })).archivedAt).not.toBeNull();
  });

  it("is limited to managers and administrators", async () => {
    const guarded = await company("Guarded");
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
    try {
      const denied = { status: "error", message: "You don't have permission to do that." };
      await expect(updateCompany(form({ companyId: guarded.id, name: "Nope" }))).resolves.toEqual(denied);
      await expect(setCompanyArchived(form({ companyId: guarded.id, archived: "true" }))).resolves.toEqual(denied);
      await expect(mergeCompanies(form({ duplicateId: guarded.id, keepId: guarded.id }))).resolves.toEqual(denied);
    } finally {
      process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    }
  });
});

describe("editing and merging pumps", () => {
  it("corrects a pump's details and adds a new catalog model on the way", async () => {
    const owner = await company("Pump Owner");
    const other = await company("Pump Other");
    const [equipment, sibling] = await Promise.all([pump(owner.id, "EDIT"), pump(owner.id, "SIBLING")]);
    const elsewhere = await prisma.location.create({ data: { companyId: other.id, name: "Elsewhere" } });
    const fields = { equipmentId: equipment.id, productModelId: "__new", newManufacturer: "Edwards", newModelName: `Catalog ${suffix}`, serialNumber: `EDITED-${suffix}`, locationId: "", description: "Dry pump" };

    await expect(updateEquipment(form({ ...fields, serialNumber: sibling.serialNumber.toLowerCase() }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("already has a pump with that serial number") });
    await expect(updateEquipment(form({ ...fields, locationId: elsewhere.id }))).resolves.toEqual({ status: "error", message: "That location belongs to a different customer." });
    await expect(updateEquipment(form(fields))).resolves.toEqual({ status: "success", message: "Pump saved." });

    const saved = await prisma.equipment.findUniqueOrThrow({ where: { id: equipment.id }, include: { catalogModel: true } });
    expect(saved).toMatchObject({ serialNumber: `EDITED-${suffix}`, productModel: `Edwards Catalog ${suffix}`, description: "Dry pump" });
    expect(saved.catalogModel).toMatchObject({ manufacturer: "Edwards", name: `Catalog ${suffix}` });
    await prisma.equipment.update({ where: { id: equipment.id }, data: { productModelId: null } });
  });

  it("moves a duplicate pump's work orders to the pump being kept", async () => {
    const owner = await company("Merge Pumps");
    const other = await company("Merge Pumps Other");
    const [keep, duplicate, foreign] = await Promise.all([pump(owner.id, "KEEP"), pump(owner.id, "KEEP-TYPO", { description: "From the duplicate" }), pump(other.id, "FOREIGN")]);
    const moved = await workOrder(owner.id, duplicate.id, "moved", { completedAt: new Date() });

    await expect(mergeEquipment(form({ duplicateId: duplicate.id, keepId: foreign.id }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("different customers") });
    await expect(mergeEquipment(form({ duplicateId: duplicate.id, keepId: duplicate.id }))).resolves.toEqual({ status: "error", message: "Choose a different pump to merge into." });
    await expect(mergeEquipment(form({ duplicateId: duplicate.id, keepId: keep.id }))).resolves.toEqual({ status: "success", message: "Merged. 1 work order moved." });

    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: moved.id } })).equipmentId).toBe(keep.id);
    const after = await prisma.equipment.findUniqueOrThrow({ where: { id: duplicate.id } });
    expect(after.mergedIntoId).toBe(keep.id);
    expect(after.archivedAt).not.toBeNull();
    expect((await prisma.equipment.findUniqueOrThrow({ where: { id: keep.id } })).description).toBe("From the duplicate");

    await expect(mergeEquipment(form({ duplicateId: duplicate.id, keepId: keep.id }))).resolves.toEqual({ status: "error", message: "This pump has already been merged into another." });
    await expect(setEquipmentArchived(form({ equipmentId: duplicate.id, archived: "false" }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("can't be restored") });
    await expect(mergeEquipment(form({ duplicateId: keep.id, keepId: duplicate.id }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("itself merged") });
  });
});

describe("merging duplicate customers", () => {
  it("moves everything to the customer being kept, combining matching locations and pumps", async () => {
    const duplicate = await company("Acme Corp");
    const keep = await company("Acme");
    const [duplicateMain, duplicateDock, keepMain] = await Promise.all([
      prisma.location.create({ data: { companyId: duplicate.id, name: "Main" } }),
      prisma.location.create({ data: { companyId: duplicate.id, name: "Dock" } }),
      prisma.location.create({ data: { companyId: keep.id, name: "MAIN" } }),
    ]);
    const [sharedOnDuplicate, onlyOnDuplicate, sharedOnKeep] = await Promise.all([
      pump(duplicate.id, "shared", { locationId: duplicateMain.id }),
      pump(duplicate.id, "ONLY", { locationId: duplicateDock.id }),
      pump(keep.id, "SHARED", { locationId: keepMain.id }),
    ]);
    const [fromShared, fromOnly, existing] = await Promise.all([
      workOrder(duplicate.id, sharedOnDuplicate.id, "from-shared", { locationId: duplicateMain.id }),
      workOrder(duplicate.id, onlyOnDuplicate.id, "from-only", { locationId: duplicateDock.id }),
      workOrder(keep.id, sharedOnKeep.id, "existing", { locationId: keepMain.id }),
    ]);
    const [companyWide, siteOnly, both] = await Promise.all([customerUser("company-wide"), customerUser("site-only"), customerUser("both")]);
    await prisma.userAccess.createMany({ data: [
      { userId: companyWide.id, companyId: duplicate.id, role: "CUSTOMER_USER", scope: "COMPANY" },
      { userId: siteOnly.id, companyId: duplicate.id, locationId: duplicateMain.id, role: "CUSTOMER_USER", scope: "LOCATION" },
      { userId: both.id, companyId: duplicate.id, role: "CUSTOMER_USER", scope: "COMPANY" },
      { userId: both.id, companyId: keep.id, role: "CUSTOMER_USER", scope: "COMPANY" },
    ] });

    await expect(mergeCompanies(form({ duplicateId: duplicate.id, keepId: keep.id }))).resolves.toEqual({ status: "success", message: "Merged. 2 work orders and 2 pumps moved." });

    // The duplicate is left behind, archived and pointing at the kept customer.
    const merged = await prisma.company.findUniqueOrThrow({ where: { id: duplicate.id } });
    expect(merged.mergedIntoId).toBe(keep.id);
    expect(merged.archivedAt).not.toBeNull();

    // Every work order now belongs to the kept customer.
    const workOrders = await prisma.workOrder.findMany({ where: { id: { in: [fromShared.id, fromOnly.id, existing.id] } } });
    expect(workOrders.every((order) => order.companyId === keep.id)).toBe(true);
    expect(workOrders.find((order) => order.id === fromShared.id)).toMatchObject({ equipmentId: sharedOnKeep.id, locationId: keepMain.id });
    expect(workOrders.find((order) => order.id === fromOnly.id)).toMatchObject({ equipmentId: onlyOnDuplicate.id, locationId: duplicateDock.id });

    // "Dock" moved across; "Main" was combined with the kept customer's "MAIN".
    expect((await prisma.location.findUniqueOrThrow({ where: { id: duplicateDock.id } })).companyId).toBe(keep.id);
    expect(await prisma.location.findUniqueOrThrow({ where: { id: duplicateMain.id } })).toMatchObject({ companyId: duplicate.id, archivedAt: expect.any(Date) });

    // The pump with a matching serial was merged; the other moved across with its location.
    expect((await prisma.equipment.findUniqueOrThrow({ where: { id: sharedOnDuplicate.id } })).mergedIntoId).toBe(sharedOnKeep.id);
    expect(await prisma.equipment.findUniqueOrThrow({ where: { id: onlyOnDuplicate.id } })).toMatchObject({ companyId: keep.id, locationId: duplicateDock.id, mergedIntoId: null });

    // Customer logins followed, without doubling up access someone already had.
    const access = await prisma.userAccess.findMany({ where: { userId: { in: [companyWide.id, siteOnly.id, both.id] } } });
    expect(access.every((grant) => grant.companyId === keep.id)).toBe(true);
    expect(access.find((grant) => grant.userId === siteOnly.id)).toMatchObject({ scope: "LOCATION", locationId: keepMain.id });
    expect(access.filter((grant) => grant.userId === both.id)).toHaveLength(1);

    await expect(mergeCompanies(form({ duplicateId: duplicate.id, keepId: keep.id }))).resolves.toEqual({ status: "error", message: "This customer has already been merged into another." });
    await expect(setCompanyArchived(form({ companyId: duplicate.id, archived: "false" }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("can't be restored") });
  });

  it("stops when both customers have a work order with the same number", async () => {
    const duplicate = await company("Clash Duplicate");
    const keep = await company("Clash Keep");
    const [first, second] = await Promise.all([pump(duplicate.id, "CLASH-A"), pump(keep.id, "CLASH-B")]);
    const number = `REC-clash-${suffix}`;
    await prisma.workOrder.create({ data: { workOrderNumber: number, companyId: duplicate.id, equipmentId: first.id, summary: "clash", serviceStageId: stage.id, customerFacingStatus: stage.customerFacingStatus, createdById: staffId } });
    await prisma.workOrder.create({ data: { workOrderNumber: number, companyId: keep.id, equipmentId: second.id, summary: "clash", serviceStageId: stage.id, customerFacingStatus: stage.customerFacingStatus, createdById: staffId } });

    await expect(mergeCompanies(form({ duplicateId: duplicate.id, keepId: keep.id }))).resolves.toEqual({ status: "error", message: `Both customers have a work order numbered ${number}. Renumber one of them before merging.` });
    // Nothing moved.
    expect((await prisma.equipment.findUniqueOrThrow({ where: { id: first.id } })).companyId).toBe(duplicate.id);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: duplicate.id } })).mergedIntoId).toBeNull();
  });
});
