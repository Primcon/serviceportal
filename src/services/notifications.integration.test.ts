import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { updateWorkOrderStatus } from "@/features/work-orders/actions";
import { claimNotification, expiredNotificationError, expireStaleNotifications, statusChangeNotification } from "@/services/notifications";
import { getActiveInternalUserForRoles } from "@/services/authorization";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID();
const savedEnvironment = { ...process.env };
let companyId = "";
let customerId = "";
let workOrderId = "";

function statusForm(stageId: string) {
  const formData = new FormData();
  formData.set("workOrderId", workOrderId);
  formData.set("serviceStageId", stageId);
  formData.set("condition", "NORMAL");
  return formData;
}

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
  delete process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
  delete process.env.AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS;
  const manager = await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER]);
  const received = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
  const company = await prisma.company.create({ data: { name: `Notification Company ${suffix}` } });
  const customer = await prisma.user.create({
    data: {
      identitySubject: `integration:notification-customer:${suffix}`,
      email: `notification-customer-${suffix}@test.invalid`,
      displayName: "Notification Customer",
      access: { create: { companyId: company.id, role: UserRole.CUSTOMER_USER } },
    },
  });
  const equipment = await prisma.equipment.create({ data: { companyId: company.id, productModel: "Notify Model", serialNumber: `NOTIFY-${suffix}` } });
  const workOrder = await prisma.workOrder.create({
    data: {
      companyId: company.id,
      equipmentId: equipment.id,
      workOrderNumber: `NOTIFY-${suffix}`,
      summary: "Notification test repair",
      serviceStageId: received.id,
      customerFacingStatus: received.customerFacingStatus,
      createdById: manager.id,
    },
  });
  companyId = company.id;
  customerId = customer.id;
  workOrderId = workOrder.id;
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: customerId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("customer status notifications", () => {
  it("describes the new status in customer terms with a link to the repair", () => {
    process.env.APP_ORIGIN = "https://portal.example.test";
    const notification = statusChangeNotification({ workOrderId: "wo-1", workOrderNumber: "48366 AZ", status: "IN_PROGRESS" });
    expect(notification.subject).toBe("Repair 48366 AZ: In progress");
    expect(notification.body).toContain("https://portal.example.test/portal/work-orders/wo-1");
    expect(notification.body).not.toMatch(/NORMAL|IN_PROGRESS/);
  });

  it("notifies customers only when the status they see changes", async () => {
    const [intake, inspection] = await Promise.all([
      prisma.serviceStage.findUniqueOrThrow({ where: { code: "INTAKE_DOCUMENTATION" } }),
      prisma.serviceStage.findUniqueOrThrow({ where: { code: "INITIAL_INSPECTION" } }),
    ]);
    expect(intake.customerFacingStatus).toBe("OPEN");
    expect(inspection.customerFacingStatus).toBe("IN_PROGRESS");

    await expect(updateWorkOrderStatus(statusForm(intake.id))).resolves.toMatchObject({ status: "success" });
    expect(await prisma.notification.count({ where: { workOrderId } })).toBe(0);

    await expect(updateWorkOrderStatus(statusForm(inspection.id))).resolves.toMatchObject({ status: "success" });
    const notifications = await prisma.notification.findMany({ where: { workOrderId }, select: { subject: true, recipientEmail: true } });
    expect(notifications).toEqual([{ subject: `Repair NOTIFY-${suffix}: In progress`, recipientEmail: `notification-customer-${suffix}@test.invalid` }]);
  });

  it("expires queued emails older than 48 hours instead of sending them", async () => {
    const queued = (label: string, createdAt: Date) => prisma.notification.create({
      data: { workOrderId, recipientEmail: `${label}-${suffix}@test.invalid`, eventKey: `expiry-test:${label}:${suffix}`, subject: label, body: label, status: "PENDING", createdAt },
    });
    const stale = await queued("stale", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
    const fresh = await queued("fresh", new Date(Date.now() - 60 * 60 * 1000));

    expect(await expireStaleNotifications()).toBeGreaterThanOrEqual(1);
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: stale.id } })).toMatchObject({ status: "FAILED", lastError: expiredNotificationError });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("PENDING");
  });

  it("lets only one dispatcher claim a pending notification", async () => {
    const notification = await prisma.notification.create({
      data: {
        workOrderId,
        recipientEmail: `claim-${suffix}@test.invalid`,
        eventKey: `claim-test:${suffix}`,
        subject: "Claim test",
        body: "Claim test",
        status: "PENDING",
      },
    });
    const claims = await Promise.all([claimNotification(notification), claimNotification(notification)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});
