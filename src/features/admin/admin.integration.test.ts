import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { updateInternalUserRole, updateServiceStage, updateUserActiveStatus } from "@/features/admin/actions";
import { listInternalUsers } from "@/features/work-orders/internal-queries";
import { getActiveInternalUserForRoles } from "@/services/authorization";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID();
const savedEnvironment = { ...process.env };
const createdUserIds: string[] = [];

async function createUser(label: string, data: { internalRole?: UserRole; displayName?: string } = {}) {
  const user = await prisma.user.create({
    data: {
      identitySubject: `integration:${label}:${suffix}`,
      email: `${label}-${suffix}@test.invalid`,
      displayName: data.displayName ?? label,
      internalRole: data.internalRole,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

beforeAll(() => {
  process.env.AUTH_MODE = "development";
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("administrator protection", () => {
  it("stops managers from demoting or disabling a portal administrator", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const administrator = await createUser("protected-admin", { internalRole: UserRole.PORTAL_ADMINISTRATOR });
    const denied = { status: "error", message: "Only a portal administrator can change another administrator's access." };

    await expect(updateInternalUserRole(form({ userId: administrator.id, internalRole: UserRole.VACTECH_SERVICE_USER }))).resolves.toEqual(denied);
    await expect(updateUserActiveStatus(form({ userId: administrator.id, isActive: "false" }))).resolves.toEqual(denied);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: administrator.id } })).toMatchObject({ internalRole: UserRole.PORTAL_ADMINISTRATOR, isActive: true });
  });

  it("still lets managers manage service users", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const technician = await createUser("managed-technician", { internalRole: UserRole.VACTECH_SERVICE_USER });
    await expect(updateUserActiveStatus(form({ userId: technician.id, isActive: "false" }))).resolves.toEqual({ status: "success" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: technician.id } })).isActive).toBe(false);
  });
});

describe("user directory filters", () => {
  it("applies the role filter and the search together", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER]);
    const name = `Filter Person ${suffix}`;
    const technician = await createUser("filter-technician", { internalRole: UserRole.VACTECH_SERVICE_USER, displayName: name });
    await createUser("filter-manager", { internalRole: UserRole.VACTECH_MANAGER, displayName: name });

    const results = await listInternalUsers({ search: name, role: UserRole.VACTECH_SERVICE_USER });
    expect(results.users.map((user) => user.id)).toEqual([technician.id]);
    expect(results.total).toBe(1);
  });
});

describe("workflow stage mapping", () => {
  it("updates the customer status of work orders already in a remapped stage", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const manager = await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER]);
    const stage = await prisma.serviceStage.create({
      data: { code: `REMAP-${suffix}`, displayName: "Remap test stage", sequence: 3000000 + Math.floor(Math.random() * 1000000), customerFacingStatus: "IN_PROGRESS" },
    });
    const company = await prisma.company.create({ data: { name: `Remap Company ${suffix}` } });
    const equipment = await prisma.equipment.create({ data: { companyId: company.id, productModel: "Remap Model", serialNumber: `REMAP-${suffix}` } });
    const workOrder = await prisma.workOrder.create({
      data: { companyId: company.id, equipmentId: equipment.id, workOrderNumber: `REMAP-${suffix}`, summary: "Remap test", serviceStageId: stage.id, customerFacingStatus: "IN_PROGRESS", createdById: manager.id },
    });

    try {
      await expect(updateServiceStage(form({ serviceStageId: stage.id, customerFacingStatus: "WAITING", isActive: "true" }))).resolves.toEqual({ status: "success" });
      expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } })).customerFacingStatus).toBe("WAITING");
      expect(await prisma.notification.count({ where: { workOrderId: workOrder.id } })).toBe(0);
    } finally {
      await prisma.workOrder.delete({ where: { id: workOrder.id } });
      await prisma.equipment.delete({ where: { id: equipment.id } });
      await prisma.company.delete({ where: { id: company.id } });
      await prisma.serviceStage.delete({ where: { id: stage.id } });
    }
  });
});
