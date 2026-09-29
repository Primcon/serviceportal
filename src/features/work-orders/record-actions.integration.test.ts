import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { deletePhoto, postWorkOrderEntry, updatePhoto, updateWorkOrderDetails } from "@/features/work-orders/record-actions";
import { getActiveInternalUserForRoles } from "@/services/authorization";
import { deletePrivateFile } from "@/services/private-storage";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/private-storage", () => ({ deletePrivateFile: vi.fn(), readPrivateFile: vi.fn(), storePrivateBuffer: vi.fn(), storePrivateFile: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };
let companyId = "";
let workOrderId = "";
let managerId = "";

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
  delete process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
  delete process.env.AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS;
  const manager = await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER]);
  managerId = manager.id;
  const stage = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
  const company = await prisma.company.create({ data: { name: `Record Company ${suffix}` } });
  await prisma.user.create({ data: { identitySubject: `integration:record-customer:${suffix}`, email: `record-customer-${suffix}@test.invalid`, displayName: "Record Customer", access: { create: { companyId: company.id, role: UserRole.CUSTOMER_USER } } } });
  const equipment = await prisma.equipment.create({ data: { companyId: company.id, productModel: "Record Model", serialNumber: `REC-${suffix}` } });
  const workOrder = await prisma.workOrder.create({ data: { workOrderNumber: `REC-${suffix}`, companyId: company.id, equipmentId: equipment.id, summary: "Record test", serviceStageId: stage.id, customerFacingStatus: stage.customerFacingStatus, createdById: manager.id } });
  companyId = company.id;
  workOrderId = workOrder.id;
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { email: { contains: suffix } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("timeline entries", () => {
  it("posts customer updates, emailing the customer only when asked", async () => {
    await expect(postWorkOrderEntry(form({ workOrderId, kind: "customer-update", title: "Rebuild underway", body: "Seals replaced.", notifyCustomer: "on" }))).resolves.toEqual({ status: "success", message: "Update posted and the customer will be emailed." });
    await expect(postWorkOrderEntry(form({ workOrderId, kind: "customer-update", title: "Quiet update", body: "No email." }))).resolves.toMatchObject({ status: "success" });
    const updates = await prisma.serviceUpdate.findMany({ where: { workOrderId, visibility: "CUSTOMER_VISIBLE" }, orderBy: { createdAt: "asc" } });
    expect(updates.map((update) => [update.title, update.notifyCustomer])).toEqual([["Rebuild underway", true], ["Quiet update", false]]);
    expect(await prisma.notification.count({ where: { workOrderId } })).toBe(1);
  });

  it("keeps internal notes and unshared findings away from customers", async () => {
    await postWorkOrderEntry(form({ workOrderId, kind: "internal-note", body: "Waiting on bearing kit." }));
    await postWorkOrderEntry(form({ workOrderId, kind: "finding", title: "Scored rotor", body: "Inlet stage scoring." }));
    await postWorkOrderEntry(form({ workOrderId, kind: "finding", title: "Worn seals", body: "Shaft seals hardened.", shareWithCustomer: "on" }));
    const note = await prisma.serviceUpdate.findFirstOrThrow({ where: { workOrderId, body: "Waiting on bearing kit." } });
    expect(note).toMatchObject({ visibility: "INTERNAL_ONLY", notifyCustomer: false });
    const findings = await prisma.finding.findMany({ where: { workOrderId }, orderBy: { title: "asc" } });
    expect(findings.map((finding) => [finding.title, finding.visibility])).toEqual([["Scored rotor", "INTERNAL_ONLY"], ["Worn seals", "CUSTOMER_VISIBLE"]]);
    const noteAudit = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: note.id } });
    expect(noteAudit.customerVisible).toBe(false);
  });

  it("requires a title for customer updates and findings", async () => {
    await expect(postWorkOrderEntry(form({ workOrderId, kind: "customer-update", title: " ", body: "Body" }))).resolves.toMatchObject({ status: "error", fieldErrors: { title: "This field is required." } });
  });
});

describe("work order details", () => {
  const baseDetails = { summary: "Record test", copperClassification: "UNKNOWN" };

  it("saves intake details and records exactly what changed", async () => {
    const result = await updateWorkOrderDetails(form({ workOrderId, ...baseDetails, customerPurchaseOrder: "PO-55120", promisedAt: "2026-10-28", toolId: "ETCH-07", contaminants: "NF3", copperClassification: "NON_COPPER", customerContactEmail: "buyer@example.test" }));
    expect(result).toEqual({ status: "success", message: "Details saved." });
    const workOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder).toMatchObject({ customerPurchaseOrder: "PO-55120", toolId: "ETCH-07", contaminants: "NF3", copperClassification: "NON_COPPER", customerContactEmail: "buyer@example.test" });
    expect(workOrder.promisedAt?.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { workOrderId, eventType: "work-order.details-updated" }, orderBy: { createdAt: "desc" } });
    expect(Object.keys(audit.metadata as object).sort()).toEqual(["contaminants", "copperClassification", "customerContactEmail", "customerPurchaseOrder", "promisedAt", "toolId"]);
  });

  it("reports when nothing changed and rejects a bad email", async () => {
    const same = await updateWorkOrderDetails(form({ workOrderId, ...baseDetails, customerPurchaseOrder: "PO-55120", promisedAt: "2026-10-28", toolId: "ETCH-07", contaminants: "NF3", copperClassification: "NON_COPPER", customerContactEmail: "buyer@example.test" }));
    expect(same).toEqual({ status: "success", message: "No changes to save." });
    await expect(updateWorkOrderDetails(form({ workOrderId, ...baseDetails, customerContactEmail: "not-an-email" }))).resolves.toMatchObject({ status: "error", fieldErrors: { customerContactEmail: "Enter a valid email address." } });
  });
});

describe("photos", () => {
  async function createPhoto(uploadedById: string) {
    return prisma.attachment.create({ data: { workOrderId, kind: "PHOTO", visibility: "CUSTOMER_VISIBLE", photoCategory: "ARRIVAL", originalStorageKey: `test/${crypto.randomUUID()}/original`, thumbnailStorageKey: `test/${crypto.randomUUID()}/thumbnail.webp`, fileName: "arrival.jpg", mimeType: "image/jpeg", sizeBytes: 100, uploadedById } });
  }

  it("updates a caption, category and sharing", async () => {
    const photo = await createPhoto(managerId);
    await expect(updatePhoto(form({ attachmentId: photo.id, caption: "Nameplate", photoCategory: "IDENTIFICATION", visibility: "INTERNAL_ONLY" }))).resolves.toMatchObject({ status: "success" });
    expect(await prisma.attachment.findUniqueOrThrow({ where: { id: photo.id } })).toMatchObject({ caption: "Nameplate", photoCategory: "IDENTIFICATION", visibility: "INTERNAL_ONLY" });
  });

  it("lets service users delete only their own photos, managers any, and removes the stored files", async () => {
    // The signed-in development identity is the same user in every role, so "someone else's
    // photo" is one uploaded by a separate colleague.
    const colleague = await prisma.user.create({ data: { identitySubject: `integration:record-tech:${suffix}`, email: `record-tech-${suffix}@test.invalid`, displayName: "Record Tech", internalRole: UserRole.VACTECH_SERVICE_USER } });
    const colleaguesPhoto = await createPhoto(colleague.id);
    const ownPhoto = await createPhoto(managerId);
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
    try {
      await expect(deletePhoto(form({ attachmentId: colleaguesPhoto.id }))).resolves.toEqual({ status: "error", message: "Only the person who uploaded this photo or a manager can delete it." });
      await expect(deletePhoto(form({ attachmentId: ownPhoto.id }))).resolves.toEqual({ status: "success", message: "Photo deleted." });
    } finally {
      process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    }
    await expect(deletePhoto(form({ attachmentId: colleaguesPhoto.id }))).resolves.toEqual({ status: "success", message: "Photo deleted." });
    expect(await prisma.attachment.count({ where: { id: { in: [colleaguesPhoto.id, ownPhoto.id] } } })).toBe(0);
    expect(vi.mocked(deletePrivateFile)).toHaveBeenCalledWith(colleaguesPhoto.originalStorageKey);
  });
});
