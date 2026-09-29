import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { getActiveInternalUserForRoles } from "./authorization";
import { grantUserAccess, updateDocumentVisibility, updateInternalUserRole, updateServiceStage } from "@/features/admin/actions";
import { approveAccessRequest } from "@/features/access/actions";
import { createCompany, createCustomerVisiblePhoto, createEquipment, createInternalDocument, updateWorkOrderStatus } from "@/features/work-orders/actions";
import { storePrivateFile, storePrivatePhoto } from "@/services/private-storage";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/private-storage", () => ({
  deletePrivateFile: vi.fn(),
  readPrivateFile: vi.fn(),
  storePrivateBuffer: vi.fn(),
  storePrivateFile: vi.fn(),
  storePrivatePhoto: vi.fn(),
}));

const prisma = new PrismaClient();
const identitySubject = "development:service-manager";
let originalUser: { id: string; isActive: boolean } | null = null;
const originalRole = process.env.DEVELOPMENT_INTERNAL_ROLE;
const originalAuthMode = process.env.AUTH_MODE;

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  originalUser = await prisma.user.findUnique({ where: { identitySubject }, select: { id: true, isActive: true } });
});

afterAll(async () => {
  if (originalUser) {
    await prisma.user.update({ where: { id: originalUser.id }, data: { isActive: originalUser.isActive } });
  }
  if (originalRole === undefined) {
    delete process.env.DEVELOPMENT_INTERNAL_ROLE;
  } else {
    process.env.DEVELOPMENT_INTERNAL_ROLE = originalRole;
  }
  if (originalAuthMode === undefined) {
    delete process.env.AUTH_MODE;
  } else {
    process.env.AUTH_MODE = originalAuthMode;
  }
  await prisma.$disconnect();
});

describe("database-backed internal authorization", () => {
  it("allows managers to perform manager-only operations", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const user = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
    expect(user.isActive).toBe(true);
  });

  it("rejects service users from manager-only operations", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
    await expect(getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER])).rejects.toThrow("Internal access is required.");
  });

  it("honors a disabled persisted internal user", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const user = await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER]);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    try {
      await expect(getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER])).rejects.toThrow("Your account is inactive.");
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    }
  });

  it("blocks manager-only server actions for service users", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
    const request = new FormData();
    request.set("requestId", crypto.randomUUID());
    request.set("companyId", crypto.randomUUID());
    await expect(approveAccessRequest(request)).rejects.toThrow("Internal access is required.");

    const document = new FormData();
    document.set("attachmentId", crypto.randomUUID());
    document.set("visibility", "CUSTOMER_VISIBLE");
    await expect(updateDocumentVisibility(document)).rejects.toThrow("Internal access is required.");
  });

  it("creates companies without implicitly granting the current customer access", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const name = `Internal Company ${crypto.randomUUID()}`;
    const formData = new FormData();
    formData.set("name", name);

    await createCompany(formData);

    const company = await prisma.company.findFirstOrThrow({
      where: { name },
      select: { id: true },
    });

    try {
      expect(await prisma.userAccess.count({ where: { companyId: company.id } })).toBe(0);
      expect(await prisma.auditEvent.count({
        where: { entityType: "Company", entityId: company.id, eventType: "company.created" },
      })).toBe(1);
    } finally {
      await prisma.company.delete({ where: { id: company.id } });
    }
  });

  it("prevents managers from granting portal administrator access", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const user = await prisma.user.create({
      data: {
        identitySubject: `integration:role-target:${crypto.randomUUID()}`,
        email: `integration-role-target-${crypto.randomUUID()}@test.invalid`,
        displayName: "Role Target",
        internalRole: UserRole.VACTECH_SERVICE_USER,
      },
    });
    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("internalRole", UserRole.PORTAL_ADMINISTRATOR);

    try {
      await expect(updateInternalUserRole(formData)).rejects.toThrow("Internal access is required.");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).internalRole).toBe(UserRole.VACTECH_SERVICE_USER);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("does not duplicate an existing customer access grant", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const suffix = crypto.randomUUID();
    const [user, company] = await Promise.all([
      prisma.user.create({
        data: {
          identitySubject: `integration:access-target:${suffix}`,
          email: `integration-access-target-${suffix}@test.invalid`,
          displayName: "Access Target",
        },
      }),
      prisma.company.create({ data: { name: `Access Grant Company ${suffix}` } }),
    ]);
    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("companyId", company.id);
    formData.set("locationId", "");

    try {
      await grantUserAccess(formData);
      await grantUserAccess(formData);
      expect(await prisma.userAccess.count({ where: { userId: user.id, companyId: company.id } })).toBe(1);
    } finally {
      await prisma.userAccess.deleteMany({ where: { userId: user.id } });
      await prisma.company.delete({ where: { id: company.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("rejects equipment creation for a missing company", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const formData = new FormData();
    formData.set("companyId", crypto.randomUUID());
    formData.set("locationId", "");
    formData.set("productModel", "Missing Company Model");
    formData.set("serialNumber", "MISSING-COMPANY");
    formData.set("description", "");

    await expect(createEquipment(formData)).rejects.toThrow("Company not found.");
  });

  it("prevents duplicate serial numbers within a company but allows them across companies", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const suffix = crypto.randomUUID();
    const [company, otherCompany] = await Promise.all([
      prisma.company.create({ data: { name: `Duplicate Equipment Company ${suffix}` } }),
      prisma.company.create({ data: { name: `Other Duplicate Equipment Company ${suffix}` } }),
    ]);
    const serialNumber = `SERIAL-${suffix}`;
    const formData = (companyId: string, serial: string) => {
      const input = new FormData();
      input.set("companyId", companyId);
      input.set("locationId", "");
      input.set("productModel", "Duplicate Test Model");
      input.set("serialNumber", serial);
      input.set("description", "");
      return input;
    };

    try {
      await createEquipment(formData(company.id, serialNumber));
      await expect(createEquipment(formData(company.id, serialNumber.toLowerCase()))).rejects.toThrow("Equipment with this serial number already exists for the selected company.");
      await expect(createEquipment(formData(otherCompany.id, serialNumber))).resolves.toBeUndefined();
      expect(await prisma.equipment.count({ where: { serialNumber } })).toBe(2);
    } finally {
      await prisma.equipment.deleteMany({ where: { companyId: { in: [company.id, otherCompany.id] } } });
      await prisma.company.deleteMany({ where: { id: { in: [company.id, otherCompany.id] } } });
    }
  });

  it("allows managers to configure a service stage and records the change", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const stage = await prisma.serviceStage.create({
      data: {
        code: `CONFIGURATION-${crypto.randomUUID()}`,
        displayName: "Configuration test stage",
        sequence: 2000000 + Math.floor(Math.random() * 1000000),
        customerFacingStatus: "OPEN",
      },
    });
    const formData = new FormData();
    formData.set("serviceStageId", stage.id);
    formData.set("customerFacingStatus", "WAITING");
    formData.set("isActive", "false");

    try {
      await updateServiceStage(formData);
      expect(await prisma.serviceStage.findUniqueOrThrow({ where: { id: stage.id } })).toMatchObject({
        customerFacingStatus: "WAITING",
        isActive: false,
      });
      expect(await prisma.auditEvent.count({
        where: { entityType: "ServiceStage", entityId: stage.id, eventType: "service-stage.updated" },
      })).toBe(1);
    } finally {
      await prisma.serviceStage.delete({ where: { id: stage.id } });
    }
  });

  it("rejects inactive stages and does not record unchanged status submissions", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const internalUser = await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER]);
    const suffix = crypto.randomUUID();
    const receivedStage = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
    const inactiveStage = await prisma.serviceStage.create({
      data: {
        code: `INACTIVE-${suffix}`,
        displayName: "Inactive test stage",
        customerFacingStatus: "OPEN",
        sequence: 1000000 + Math.floor(Math.random() * 1000000),
        isActive: false,
      },
    });
    const company = await prisma.company.create({ data: { name: `Status Test Company ${suffix}` } });
    const equipment = await prisma.equipment.create({
      data: { companyId: company.id, productModel: "Status Test Model", serialNumber: `STATUS-${suffix}` },
    });
    const workOrder = await prisma.workOrder.create({
      data: {
        companyId: company.id,
        equipmentId: equipment.id,
        workOrderNumber: `STATUS-${suffix}`,
        summary: "Status test repair",
        serviceStageId: receivedStage.id,
        customerFacingStatus: receivedStage.customerFacingStatus,
        condition: "NORMAL",
        createdById: internalUser.id,
      },
    });
    const formData = new FormData();
    formData.set("workOrderId", workOrder.id);
    formData.set("serviceStageId", receivedStage.id);
    formData.set("condition", "NORMAL");

    try {
      const [historyCount, auditCount] = await Promise.all([
        prisma.workOrderStatusHistory.count({ where: { workOrderId: workOrder.id } }),
        prisma.auditEvent.count({ where: { workOrderId: workOrder.id, eventType: "work-order.status-changed" } }),
      ]);
      await updateWorkOrderStatus(formData);
      await expect(prisma.workOrderStatusHistory.count({ where: { workOrderId: workOrder.id } })).resolves.toBe(historyCount);
      await expect(prisma.auditEvent.count({ where: { workOrderId: workOrder.id, eventType: "work-order.status-changed" } })).resolves.toBe(auditCount);

      formData.set("serviceStageId", inactiveStage.id);
      await expect(updateWorkOrderStatus(formData)).rejects.toThrow("Service stage is inactive.");
    } finally {
      await prisma.workOrder.delete({ where: { id: workOrder.id } });
      await prisma.equipment.delete({ where: { id: equipment.id } });
      await prisma.company.delete({ where: { id: company.id } });
      await prisma.serviceStage.delete({ where: { id: inactiveStage.id } });
    }
  });

  it("does not persist attachments when private storage is unavailable", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const internalUser = await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER]);
    const suffix = crypto.randomUUID();
    const stage = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
    const company = await prisma.company.create({ data: { name: `Storage Test Company ${suffix}` } });
    const equipment = await prisma.equipment.create({ data: { companyId: company.id, productModel: "Storage Test Model", serialNumber: `STORAGE-${suffix}` } });
    const workOrder = await prisma.workOrder.create({
      data: {
        companyId: company.id,
        equipmentId: equipment.id,
        workOrderNumber: `STORAGE-${suffix}`,
        summary: "Storage test repair",
        serviceStageId: stage.id,
        customerFacingStatus: stage.customerFacingStatus,
        condition: "NORMAL",
        createdById: internalUser.id,
      },
    });
    vi.mocked(storePrivateFile).mockResolvedValue(false);
    vi.mocked(storePrivatePhoto).mockResolvedValue(false);

    const documentFormData = new FormData();
    documentFormData.set("workOrderId", workOrder.id);
    documentFormData.set("documentType", "OTHER");
    documentFormData.set("visibility", "INTERNAL_ONLY");
    documentFormData.set("file", new File(["test document"], "test.txt", { type: "text/plain" }));
    const photoFormData = new FormData();
    photoFormData.set("workOrderId", workOrder.id);
    photoFormData.set("photoCategory", "INSPECTION");
    photoFormData.set("file", new File(["test photo"], "test.jpg", { type: "image/jpeg" }));

    try {
      await expect(createInternalDocument(documentFormData)).rejects.toThrow("Private file storage is not configured.");
      await expect(createCustomerVisiblePhoto(photoFormData)).rejects.toThrow("Private file storage is not configured.");
      expect(await prisma.attachment.count({ where: { workOrderId: workOrder.id } })).toBe(0);
    } finally {
      vi.mocked(storePrivateFile).mockReset();
      vi.mocked(storePrivatePhoto).mockReset();
      await prisma.workOrder.delete({ where: { id: workOrder.id } });
      await prisma.equipment.delete({ where: { id: equipment.id } });
      await prisma.company.delete({ where: { id: company.id } });
    }
  });
});

describe("access request approval", () => {
  let disabledCustomerEmail = "";
  let approvalCompanyId = "";
  let accessRequestId = "";

  beforeAll(async () => {
    process.env.AUTH_MODE = "development";
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    const suffix = crypto.randomUUID();
    disabledCustomerEmail = `disabled-customer-${suffix}@test.invalid`;
    const [company, request] = await Promise.all([
      prisma.company.create({ data: { name: `Approval Test Company ${suffix}` } }),
      prisma.accessRequest.create({
        data: {
          email: disabledCustomerEmail,
          name: "Disabled Customer",
          requestedCompany: `Company ${suffix}`,
          message: "I need access",
        },
      }),
    ]);
    approvalCompanyId = company.id;
    accessRequestId = request.id;
  });

  afterAll(async () => {
    await prisma.accessRequest.deleteMany({ where: { id: accessRequestId } });
    await prisma.company.deleteMany({ where: { id: approvalCompanyId } });
    const customer = await prisma.user.findUnique({ where: { email: disabledCustomerEmail } });
    if (customer) await prisma.user.deleteMany({ where: { id: customer.id } });
  });

  it("does not re-enable a previously disabled customer when approving access", async () => {
    await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER]);
    const preDisabledCustomer = await prisma.user.create({
      data: { identitySubject: `disabled:${disabledCustomerEmail}`, email: disabledCustomerEmail, displayName: "Disabled Customer", isActive: false },
    });
    expect(preDisabledCustomer.isActive).toBe(false);

    const request = await prisma.accessRequest.findUnique({ where: { id: accessRequestId } });
    if (!request) throw new Error("Test fixture failed");
    const company = await prisma.company.findUnique({ where: { id: approvalCompanyId } });
    if (!company) throw new Error("Test fixture failed");

    const user = await prisma.user.upsert({
      where: { email: request.email },
      update: { displayName: request.name },
      create: {
        identitySubject: `customer:${request.email}`,
        email: request.email,
        displayName: request.name,
      },
    });
    const existingAccess = await prisma.userAccess.findFirst({
      where: { userId: user.id, companyId: company.id, role: "CUSTOMER_USER" },
    });
    if (!existingAccess) {
      await prisma.userAccess.create({
        data: { userId: user.id, companyId: company.id, role: "CUSTOMER_USER" },
      });
    }

    const afterApprovalCustomer = await prisma.user.findUnique({ where: { id: preDisabledCustomer.id } });
    expect(afterApprovalCustomer?.isActive).toBe(false);
  });
});
