import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { saveListOption, saveServiceCenter } from "@/features/settings/actions";
import { navigationForRole } from "@/features/navigation/workspace-items";
import { getActiveInternalUserForRoles } from "@/services/authorization";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

beforeAll(() => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
});

afterAll(async () => {
  await prisma.listOption.deleteMany({ where: { label: { contains: suffix } } });
  await prisma.workOrder.deleteMany({ where: { workOrderNumber: `SET-${suffix}` } });
  await prisma.equipment.deleteMany({ where: { serialNumber: `SET-${suffix}` } });
  await prisma.company.deleteMany({ where: { name: `Settings Company ${suffix}` } });
  await prisma.serviceCenter.deleteMany({ where: { name: { contains: suffix } } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("picklist settings", () => {
  it("adds options and refuses a duplicate label regardless of capitalization", async () => {
    const label = `Overnight ${suffix}`;
    await expect(saveListOption(form({ kind: "PRIORITY", label, sortOrder: "9" }))).resolves.toMatchObject({ status: "success" });
    await expect(saveListOption(form({ kind: "PRIORITY", label: label.toUpperCase(), sortOrder: "10" }))).resolves.toEqual({ status: "error", message: `"${label.toUpperCase()}" is already in this list.` });
    const option = await prisma.listOption.findFirstOrThrow({ where: { label } });
    expect(option).toMatchObject({ kind: "PRIORITY", sortOrder: 9, isActive: true });

    await expect(saveListOption(form({ id: option.id, kind: "PRIORITY", label, sortOrder: "9", isActiveField: "1" }))).resolves.toMatchObject({ status: "success" });
    expect((await prisma.listOption.findUniqueOrThrow({ where: { id: option.id } })).isActive).toBe(false);
  });

  it("is limited to managers and administrators", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
    try {
      await expect(saveListOption(form({ kind: "SERVICE_TYPE", label: `Blocked ${suffix}`, sortOrder: "1" }))).resolves.toMatchObject({ status: "error", message: "You don't have permission to do that." });
    } finally {
      process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    }
  });
});

describe("service center settings", () => {
  it("locks a center's code once work order numbers use it, but allows renaming", async () => {
    const code = `Q${suffix.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase().padEnd(2, "Q")}`.slice(0, 3);
    await expect(saveServiceCenter(form({ code, name: `Test center ${suffix}` }))).resolves.toMatchObject({ status: "success" });
    await expect(saveServiceCenter(form({ code: code.toLowerCase(), name: `Duplicate ${suffix}` }))).resolves.toEqual({ status: "error", message: `Service center ${code} already exists.` });
    const center = await prisma.serviceCenter.findUniqueOrThrow({ where: { code } });

    const manager = await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER]);
    const stage = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
    const company = await prisma.company.create({ data: { name: `Settings Company ${suffix}` } });
    const equipment = await prisma.equipment.create({ data: { companyId: company.id, productModel: "Settings Model", serialNumber: `SET-${suffix}` } });
    await prisma.workOrder.create({ data: { workOrderNumber: `SET-${suffix}`, companyId: company.id, equipmentId: equipment.id, summary: "Settings test", serviceStageId: stage.id, customerFacingStatus: stage.customerFacingStatus, createdById: manager.id, serviceCenterId: center.id } });

    await expect(saveServiceCenter(form({ id: center.id, code: "ZZZZ", name: center.name, isActiveField: "1", isActive: "on" }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("can't be changed") });
    await expect(saveServiceCenter(form({ id: center.id, code, name: `Renamed ${suffix}`, isActiveField: "1", isActive: "on" }))).resolves.toMatchObject({ status: "success" });
    expect((await prisma.serviceCenter.findUniqueOrThrow({ where: { id: center.id } })).name).toBe(`Renamed ${suffix}`);
  });

  it("rejects codes that aren't 2 to 4 letters", async () => {
    await expect(saveServiceCenter(form({ code: "A1", name: `Bad ${suffix}` }))).resolves.toMatchObject({ status: "error", fieldErrors: { code: "Use 2 to 4 letters, such as AZ." } });
  });
});

describe("workspace navigation", () => {
  it("shows service users only the service pages, and managers everything", () => {
    const serviceUserPages = navigationForRole(UserRole.VACTECH_SERVICE_USER).flatMap((group) => group.items.map((item) => item.href));
    expect(serviceUserPages).toEqual(["/workspace", "/workspace/work-orders", "/workspace/equipment"]);
    const managerPages = navigationForRole(UserRole.VACTECH_MANAGER).flatMap((group) => group.items.map((item) => item.href));
    expect(managerPages).toContain("/workspace/settings");
    expect(navigationForRole(null)).toEqual([]);
  });
});
