import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CustomerFacingStatus, PrismaClient, RecordVisibility, UserRole, WorkOrderCondition } from "@prisma/client";
import { getCustomerEquipment, getCustomerWorkOrder, listCustomerEquipment, listCustomerWorkOrders } from "./customer-queries";
import { logCustomerNotification } from "@/services/notifications";

const prisma = new PrismaClient();
const originalAcsConnectionString = process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
const originalAcsSenderAddress = process.env.AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS;
let customerId = "";
let customerIdentitySubject = "";
let internalId = "";
let otherLocationCustomerId = "";
let companyAccessCustomerId = "";
let companyId = "";
let otherCompanyId = "";
let locationId = "";
let otherLocationId = "";
let equipmentId = "";
let workOrderId = "";
let otherWorkOrderId = "";

beforeAll(async () => {
  delete process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
  delete process.env.AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS;
  const suffix = crypto.randomUUID();
  const [customer, internal, otherLocationCustomer, companyAccessCustomer] = await Promise.all([
    prisma.user.create({ data: { identitySubject: `integration:customer:${suffix}`, email: `integration-customer-${suffix}@test.invalid`, displayName: "Integration Customer" } }),
    prisma.user.create({ data: { identitySubject: `integration:internal:${suffix}`, email: `integration-internal-${suffix}@test.invalid`, displayName: "Integration Internal" } }),
    prisma.user.create({ data: { identitySubject: `integration:other-location:${suffix}`, email: `integration-other-location-${suffix}@test.invalid`, displayName: "Other Location Customer" } }),
    prisma.user.create({ data: { identitySubject: `integration:company-access:${suffix}`, email: `integration-company-access-${suffix}@test.invalid`, displayName: "Company Access Customer" } }),
  ]);
  customerId = customer.id;
  customerIdentitySubject = customer.identitySubject;
  internalId = internal.id;
  otherLocationCustomerId = otherLocationCustomer.id;
  companyAccessCustomerId = companyAccessCustomer.id;

  const [company, otherCompany] = await Promise.all([
    prisma.company.create({ data: { name: `Integration Company ${suffix}` } }),
    prisma.company.create({ data: { name: `Other Integration Company ${suffix}` } }),
  ]);
  companyId = company.id;
  otherCompanyId = otherCompany.id;
  const [location, otherLocation] = await Promise.all([
    prisma.location.create({ data: { companyId: company.id, name: `Authorized Location ${suffix}` } }),
    prisma.location.create({ data: { companyId: company.id, name: `Private Location ${suffix}` } }),
  ]);
  locationId = location.id;
  otherLocationId = otherLocation.id;
  await prisma.userAccess.create({ data: { userId: customer.id, companyId: company.id, role: UserRole.CUSTOMER_USER, scope: "LOCATION", locationId } });
  await prisma.userAccess.create({ data: { userId: otherLocationCustomer.id, companyId: company.id, role: UserRole.CUSTOMER_USER, scope: "LOCATION", locationId: otherLocation.id } });
  await prisma.userAccess.create({ data: { userId: companyAccessCustomer.id, companyId: company.id, role: UserRole.CUSTOMER_USER, scope: "COMPANY" } });
  await prisma.userAccess.create({ data: { userId: companyAccessCustomer.id, companyId: company.id, role: UserRole.CUSTOMER_USER, scope: "LOCATION", locationId } });

  const [equipment, otherEquipment] = await Promise.all([
    prisma.equipment.create({ data: { companyId: company.id, locationId, productModel: "Visible Model", serialNumber: `VISIBLE-${suffix}` } }),
    prisma.equipment.create({ data: { companyId: otherCompany.id, productModel: "Private Model", serialNumber: `PRIVATE-${suffix}` } }),
  ]);
  equipmentId = equipment.id;
  const stage = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });

  const [workOrder, otherWorkOrder] = await Promise.all([
    prisma.workOrder.create({ data: { companyId: company.id, locationId, equipmentId: equipment.id, workOrderNumber: `INT-${suffix}`, summary: "Authorized repair", serviceStageId: stage.id, customerFacingStatus: CustomerFacingStatus.OPEN, condition: WorkOrderCondition.NORMAL, createdById: internal.id } }),
    prisma.workOrder.create({ data: { companyId: otherCompany.id, equipmentId: otherEquipment.id, workOrderNumber: `PRIVATE-${suffix}`, summary: "Unauthorized repair", serviceStageId: stage.id, customerFacingStatus: CustomerFacingStatus.OPEN, condition: WorkOrderCondition.NORMAL, createdById: internal.id } }),
  ]);
  workOrderId = workOrder.id;
  otherWorkOrderId = otherWorkOrder.id;

  await prisma.serviceUpdate.createMany({ data: [
    { workOrderId: workOrder.id, title: "Visible update", body: "Customer-safe update", visibility: RecordVisibility.CUSTOMER_VISIBLE, createdById: internal.id },
    { workOrderId: workOrder.id, title: "Private update", body: "Internal update", visibility: RecordVisibility.INTERNAL_ONLY, createdById: internal.id },
  ] });
  await prisma.finding.create({ data: { workOrderId: workOrder.id, title: "Private finding", body: "Internal-only finding", createdById: internal.id } });
  await prisma.attachment.createMany({ data: [
    { workOrderId: workOrder.id, equipmentId: equipment.id, kind: "PHOTO", visibility: RecordVisibility.CUSTOMER_VISIBLE, originalStorageKey: "integration/visible", fileName: "visible.jpg", mimeType: "image/jpeg", sizeBytes: 1, uploadedById: internal.id },
    { workOrderId: workOrder.id, equipmentId: equipment.id, kind: "DOCUMENT", visibility: RecordVisibility.INTERNAL_ONLY, originalStorageKey: "integration/private", fileName: "private.pdf", mimeType: "application/pdf", sizeBytes: 1, uploadedById: internal.id },
  ] });
  await prisma.auditEvent.createMany({ data: [
    { workOrderId: workOrder.id, eventType: "visible.event", entityType: "Test", customerVisible: true },
    { workOrderId: workOrder.id, eventType: "private.event", entityType: "Test", customerVisible: false },
  ] });

  const restrictedEquipment = await prisma.equipment.create({ data: { companyId: company.id, locationId: otherLocationId, productModel: "Restricted Model", serialNumber: `RESTRICTED-${suffix}` } });
  await prisma.workOrder.create({ data: { companyId: company.id, locationId: otherLocationId, equipmentId: restrictedEquipment.id, workOrderNumber: `RESTRICTED-${suffix}`, summary: "Restricted repair", serviceStageId: stage.id, customerFacingStatus: CustomerFacingStatus.OPEN, condition: WorkOrderCondition.NORMAL, createdById: internal.id } });
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.equipment.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.userAccess.deleteMany({ where: { userId: { in: [customerId, otherLocationCustomerId, companyAccessCustomerId] }, companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.location.deleteMany({ where: { id: { in: [locationId, otherLocationId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [customerId, internalId, otherLocationCustomerId, companyAccessCustomerId] } } });
  if (originalAcsConnectionString === undefined) delete process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
  else process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING = originalAcsConnectionString;
  if (originalAcsSenderAddress === undefined) delete process.env.AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS;
  else process.env.AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS = originalAcsSenderAddress;
  await prisma.$disconnect();
});

describe("customer query authorization", () => {
  it("returns only work orders for locations granted to the customer", async () => {
    const { workOrders, total } = await listCustomerWorkOrders(customerIdentitySubject);
    expect(total).toBe(1);
    expect(workOrders).toHaveLength(1);
    expect(workOrders[0].id).toBe(workOrderId);
    expect(workOrders.some((workOrder) => workOrder.id === otherWorkOrderId)).toBe(false);
  });

  it("rejects equipment and work orders at other locations in the same company", async () => {
    const { equipment } = await listCustomerEquipment(customerIdentitySubject);
    expect(equipment).toHaveLength(1);
    expect(equipment[0].id).toBe(equipmentId);

    const restrictedWorkOrder = await prisma.workOrder.findFirstOrThrow({
      where: { companyId, locationId: otherLocationId },
      select: { id: true, equipmentId: true },
    });
    expect(await getCustomerWorkOrder(customerIdentitySubject, restrictedWorkOrder.id)).toBeNull();
    expect(await getCustomerEquipment(customerIdentitySubject, restrictedWorkOrder.equipmentId)).toBeNull();
  });

  it("filters internal related records from an authorized customer work order", async () => {
    const workOrder = await getCustomerWorkOrder(customerIdentitySubject, workOrderId);
    expect(workOrder?.id).toBe(workOrderId);
    expect(workOrder?.updates).toHaveLength(1);
    expect(workOrder?.updates[0].title).toBe("Visible update");
    expect(workOrder?.attachments).toHaveLength(1);
    expect(workOrder?.attachments[0].fileName).toBe("visible.jpg");
    expect(workOrder?.auditEvents).toHaveLength(1);
    expect(workOrder?.auditEvents[0].eventType).toBe("visible.event");
    // The fixture's only finding is internal, so customers must not receive it.
    expect(workOrder?.findings).toEqual([]);
  });

  it("logs customer notifications only when an update is explicitly marked for delivery", async () => {
    const baseCount = await prisma.notification.count({ where: { workOrderId } });

    const silentUpdate = await prisma.serviceUpdate.create({
      data: {
        workOrderId,
        title: "Silent update",
        body: "This should not notify the customer.",
        visibility: RecordVisibility.CUSTOMER_VISIBLE,
        notifyCustomer: false,
        createdById: internalId,
      },
    });

    await logCustomerNotification(prisma, {
      companyId,
      workOrderId,
      serviceUpdateId: silentUpdate.id,
    });

    expect(await prisma.notification.count({ where: { workOrderId } })).toBe(baseCount);

    const notifiedUpdate = await prisma.serviceUpdate.create({
      data: {
        workOrderId,
        title: "Notified update",
        body: "This should notify the customer.",
        visibility: RecordVisibility.CUSTOMER_VISIBLE,
        notifyCustomer: true,
        createdById: internalId,
      },
    });

    await logCustomerNotification(prisma, {
      companyId,
      workOrderId,
      serviceUpdateId: notifiedUpdate.id,
    });

    expect(await prisma.notification.count({ where: { workOrderId } })).toBe(baseCount + 2);
  });

  it("prevents duplicate customer notifications for the same update", async () => {
    const duplicateUpdate = await prisma.serviceUpdate.create({
      data: {
        workOrderId,
        title: "Duplicate guard",
        body: "This should only be logged once.",
        visibility: RecordVisibility.CUSTOMER_VISIBLE,
        notifyCustomer: true,
        createdById: internalId,
      },
    });

    await Promise.all([
      logCustomerNotification(prisma, {
        companyId,
        workOrderId,
        serviceUpdateId: duplicateUpdate.id,
      }),
      logCustomerNotification(prisma, {
        companyId,
        workOrderId,
        serviceUpdateId: duplicateUpdate.id,
      }),
    ]);

    expect(await prisma.notification.count({ where: { workOrderId, serviceUpdateId: duplicateUpdate.id } })).toBe(2);
  });

  it("notifies only customers authorized for the work order location", async () => {
    const locationUpdate = await prisma.serviceUpdate.create({
      data: {
        workOrderId,
        title: "Location-specific update",
        body: "This update belongs to the authorized location.",
        visibility: RecordVisibility.CUSTOMER_VISIBLE,
        notifyCustomer: true,
        createdById: internalId,
      },
    });

    await logCustomerNotification(prisma, {
      companyId,
      workOrderId,
      serviceUpdateId: locationUpdate.id,
    });

    const recipients = await prisma.notification.findMany({
      where: { serviceUpdateId: locationUpdate.id },
      select: { recipientEmail: true, status: true },
      orderBy: { recipientEmail: "asc" },
    });
    const suffix = customerIdentitySubject.split(":").at(-1);
    expect(recipients).toEqual([
      { recipientEmail: `integration-company-access-${suffix}@test.invalid`, status: "LOGGED" },
      { recipientEmail: `integration-customer-${suffix}@test.invalid`, status: "LOGGED" },
    ]);
  });

  it("rejects guessed cross-company detail access", async () => {
    expect(await getCustomerWorkOrder(customerIdentitySubject, otherWorkOrderId)).toBeNull();
  });

  it("rejects disabled customer users", async () => {
    await prisma.user.update({ where: { id: customerId }, data: { isActive: false } });
    try {
      expect((await listCustomerWorkOrders(customerIdentitySubject)).workOrders).toEqual([]);
      expect(await getCustomerWorkOrder(customerIdentitySubject, workOrderId)).toBeNull();
    } finally {
      await prisma.user.update({ where: { id: customerId }, data: { isActive: true } });
    }
  });
});
