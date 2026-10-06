import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { decideWarrantyClaim, openWarrantyClaim, saveContractWarranty, saveCustomerWarrantyVisibility, saveModelWarranty, saveShipping, setWarrantyApprover, withdrawWarrantyClaim } from "@/features/warranty/actions";
import { customerWarrantySetting, pendingWarrantyClaims } from "@/features/warranty/queries";
import { addMonths, shopToday } from "@/features/warranty/warranty";
import { updateWorkOrderStatus } from "@/features/work-orders/actions";
import { getWorkOrderAsCustomerSeesIt } from "@/features/work-orders/customer-queries";
import { getActiveInternalUser } from "@/services/authorization";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };
let companyId = "";
let equipmentId = "";
let modelId = "";
let meId = "";
let approverId = "";
let savedSetting: string | null = null;
let stages: Record<string, { id: string; customerFacingStatus: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED" }> = {};
let counter = 0;

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

function as(role: UserRole) {
  process.env.DEVELOPMENT_INTERNAL_ROLE = role;
}

/** A work order for the test pump, created a little after the previous one so "earlier repair" is unambiguous. */
async function workOrder(label: string, data: { shippedAt?: Date; warrantyMonths?: number; warrantyEndsAt?: Date; equipmentId?: string } = {}) {
  counter += 1;
  return prisma.workOrder.create({
    data: { workOrderNumber: `WAR-${label}-${suffix}`, companyId, equipmentId, summary: label, serviceStageId: stages.RECEIVED.id, customerFacingStatus: stages.RECEIVED.customerFacingStatus, createdById: meId, createdAt: new Date(Date.UTC(2026, 0, counter)), ...data },
  });
}

const ship = (workOrderId: string) => updateWorkOrderStatus(form({ workOrderId, serviceStageId: stages.SHIPPED.id, condition: "NORMAL", note: "", overrideReason: "" }));
const day = (text: string) => new Date(`${text}T00:00:00.000Z`);

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  as(UserRole.VACTECH_SERVICE_USER);
  meId = (await getActiveInternalUser()).id;
  approverId = (await prisma.user.create({ data: { identitySubject: `warranty:approver:${suffix}`, email: `warranty-approver-${suffix}@test.invalid`, displayName: "Approver", internalRole: UserRole.VACTECH_SERVICE_USER, canApproveWarranty: true } })).id;
  stages = Object.fromEntries((await prisma.serviceStage.findMany()).map((stage) => [stage.code, stage]));
  savedSetting = (await prisma.portalSetting.findUnique({ where: { key: customerWarrantySetting } }))?.value ?? null;
  const model = await prisma.productModel.create({ data: { manufacturer: "Warranty", name: `Model ${suffix}` } });
  modelId = model.id;
  companyId = (await prisma.company.create({ data: { name: `Warranty Company ${suffix}` } })).id;
  equipmentId = (await prisma.equipment.create({ data: { companyId, productModelId: modelId, productModel: `Warranty Model ${suffix}`, serialNumber: `WAR-${suffix}` } })).id;
});

afterAll(async () => {
  await prisma.user.update({ where: { id: meId }, data: { canApproveWarranty: false } });
  await prisma.notification.deleteMany({ where: { recipientEmail: { endsWith: `${suffix}@test.invalid` } } });
  // Claims point at the repairs they're made against, so they're unlinked before the work orders go.
  await prisma.workOrder.updateMany({ where: { companyId }, data: { warrantyClaimOnId: null } });
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.productModel.deleteMany({ where: { id: modelId } });
  await prisma.user.deleteMany({ where: { id: approverId } });
  if (savedSetting === null) await prisma.portalSetting.deleteMany({ where: { key: customerWarrantySetting } });
  else await prisma.portalSetting.update({ where: { key: customerWarrantySetting }, data: { value: savedSetting } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("a repair's warranty", () => {
  it("starts on the day it ships, for the model's standard length or the customer's contract", async () => {
    const noTerms = await workOrder("no-terms");
    await expect(ship(noTerms.id)).resolves.toMatchObject({ status: "success" });
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: noTerms.id } })).toMatchObject({ shippedAt: shopToday(), warrantyMonths: null, warrantyEndsAt: null });

    as(UserRole.VACTECH_MANAGER);
    await expect(saveModelWarranty(form({ modelId, months: "6" }))).resolves.toMatchObject({ status: "success" });
    await expect(saveModelWarranty(form({ modelId, months: "0" }))).resolves.toMatchObject({ status: "error", fieldErrors: { months: expect.stringContaining("whole months") } });
    as(UserRole.VACTECH_SERVICE_USER);
    await expect(saveModelWarranty(form({ modelId, months: "12" }))).resolves.toMatchObject({ status: "error", message: "You don't have permission to do that." });

    const standard = await workOrder("standard");
    await ship(standard.id);
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: standard.id } })).toMatchObject({ shippedAt: shopToday(), warrantyMonths: 6, warrantyEndsAt: addMonths(shopToday(), 6) });
    expect(await prisma.auditEvent.count({ where: { workOrderId: standard.id, eventType: "work-order.shipping-updated" } })).toBe(1);

    as(UserRole.VACTECH_MANAGER);
    await expect(saveContractWarranty(form({ companyId, months: "24" }))).resolves.toMatchObject({ status: "success" });
    as(UserRole.VACTECH_SERVICE_USER);
    const contract = await workOrder("contract");
    await ship(contract.id);
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({ warrantyMonths: 24, warrantyEndsAt: addMonths(shopToday(), 24) });
    // A repair that has already shipped keeps the warranty it shipped with.
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: standard.id } })).warrantyMonths).toBe(6);
    await prisma.company.update({ where: { id: companyId }, data: { contractWarrantyMonths: null } });
  });

  it("keeps a ship date that was entered before the job reached Shipped", async () => {
    const order = await workOrder("entered-early");
    await expect(saveShipping(form({ workOrderId: order.id, shippedAt: "2026-03-02", warrantyMonths: "" }))).resolves.toEqual({ status: "success", message: "Shipping and warranty saved." });
    await ship(order.id);
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ shippedAt: day("2026-03-02"), warrantyMonths: 6, warrantyEndsAt: day("2026-09-02") });
  });

  it("lets any staff member record the ship date, but only a manager or approver change the length", async () => {
    const order = await workOrder("length");
    const tomorrow = new Date(shopToday().getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await expect(saveShipping(form({ workOrderId: order.id, shippedAt: tomorrow, warrantyMonths: "" }))).resolves.toEqual({ status: "error", message: "The ship date can't be in the future." });
    await expect(saveShipping(form({ workOrderId: order.id, shippedAt: "2026-05-31", warrantyMonths: "12" }))).resolves.toEqual({ status: "error", message: "Only a manager or a warranty approver can change the warranty length." });
    await expect(saveShipping(form({ workOrderId: order.id, shippedAt: "2026-05-31", warrantyMonths: "6" }))).resolves.toMatchObject({ status: "success" });
    await expect(saveShipping(form({ workOrderId: order.id, shippedAt: "2026-05-31", warrantyMonths: "" }))).resolves.toEqual({ status: "success", message: "No changes to save." });

    as(UserRole.VACTECH_MANAGER);
    await expect(saveShipping(form({ workOrderId: order.id, shippedAt: "2026-05-31", warrantyMonths: "9" }))).resolves.toMatchObject({ status: "success" });
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ warrantyMonths: 9, warrantyEndsAt: day("2027-02-28") });
    await expect(saveShipping(form({ workOrderId: order.id, shippedAt: "2026-05-31", warrantyMonths: "0" }))).resolves.toMatchObject({ status: "success" });
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ warrantyMonths: 0, warrantyEndsAt: null });
    as(UserRole.VACTECH_SERVICE_USER);
  });

  it("is shown to customers only when the portal is set to", async () => {
    const order = await workOrder("customer", { shippedAt: day("2026-04-01"), warrantyMonths: 12, warrantyEndsAt: day("2027-04-01") });
    as(UserRole.VACTECH_MANAGER);
    await expect(saveCustomerWarrantyVisibility(form({}))).resolves.toMatchObject({ status: "success" });
    expect((await getWorkOrderAsCustomerSeesIt(order.id))?.warrantyEndsAt).toBeNull();
    await expect(saveCustomerWarrantyVisibility(form({ visible: "on" }))).resolves.toEqual({ status: "success", message: "Customers can now see warranty dates." });
    expect((await getWorkOrderAsCustomerSeesIt(order.id))?.warrantyEndsAt).toEqual(day("2027-04-01"));
    // The claim and its decision are never part of what customers are given.
    expect(Object.keys((await getWorkOrderAsCustomerSeesIt(order.id))!).filter((key) => /claim|decision|shipped|months/i.test(key))).toEqual([]);
    as(UserRole.VACTECH_SERVICE_USER);
  });
});

describe("a warranty claim", () => {
  it("is opened against the pump's previous repair, reviewed by a named approver, and recorded", async () => {
    // Its own pump, so the repairs shipped in the tests above aren't its previous repair.
    const pump = await prisma.equipment.create({ data: { companyId, productModel: "Warranty Claim", serialNumber: `WAR-CLAIM-${suffix}` } });
    const first = await workOrder("claim-first", { equipmentId: pump.id, shippedAt: day("2026-02-01"), warrantyMonths: 12, warrantyEndsAt: day("2027-02-01") });
    const second = await workOrder("claim-second", { equipmentId: pump.id });

    await expect(openWarrantyClaim(form({ workOrderId: second.id, reason: "Same bearing noise." }))).resolves.toMatchObject({ status: "success" });
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ warrantyClaimOnId: first.id, warrantyDecision: "PENDING", condition: "WARRANTY_REVIEW" });
    await expect(openWarrantyClaim(form({ workOrderId: second.id, reason: "" }))).resolves.toEqual({ status: "error", message: "This job already has a warranty claim." });
    expect((await pendingWarrantyClaims()).map((claim) => claim.id)).toContain(second.id);

    // The approver is emailed, with a link to the work order.
    const email = await prisma.notification.findFirstOrThrow({ where: { recipientEmail: `warranty-approver-${suffix}@test.invalid` } });
    expect(email).toMatchObject({ kind: "ACCESS", linkPath: `/workspace/work-orders/${second.id}`, subject: `Warranty claim to review: WIP ${second.workOrderNumber}` });
    expect(email.body).toContain("Same bearing noise.");

    // A manager's role isn't enough: only the named approvers decide.
    as(UserRole.VACTECH_MANAGER);
    await expect(decideWarrantyClaim(form({ workOrderId: second.id, decision: "APPROVED", note: "" }))).resolves.toEqual({ status: "error", message: "Only a warranty approver can decide a warranty claim." });
    // Approvers are named in Users, and only staff can be named.
    await expect(setWarrantyApprover(form({ userId: approverId, canApprove: "false" }))).resolves.toEqual({ status: "success", message: "This person can no longer decide warranty claims." });
    await expect(setWarrantyApprover(form({ userId: approverId, canApprove: "true" }))).resolves.toEqual({ status: "success", message: "This person can now decide warranty claims." });
    const customer = await prisma.user.create({ data: { identitySubject: `warranty:customer:${suffix}`, email: `warranty-customer-${suffix}@test.invalid`, displayName: "Customer" } });
    await expect(setWarrantyApprover(form({ userId: customer.id, canApprove: "true" }))).resolves.toEqual({ status: "error", message: "Only staff can approve warranty claims." });
    await prisma.user.delete({ where: { id: customer.id } });
    // The development sign-in may have no stored staff role, so it's flagged directly.
    await prisma.user.update({ where: { id: meId }, data: { canApproveWarranty: true } });
    as(UserRole.VACTECH_SERVICE_USER);

    await expect(decideWarrantyClaim(form({ workOrderId: second.id, decision: "DENIED", note: "" }))).resolves.toEqual({ status: "error", message: "Give the reason the claim is denied. It's kept with the job." });
    await expect(decideWarrantyClaim(form({ workOrderId: second.id, decision: "APPROVED", note: "Bearing was replaced in the last rebuild." }))).resolves.toEqual({ status: "success", message: "Claim approved. This repair is covered by warranty." });
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ warrantyDecision: "APPROVED", warrantyDecidedById: meId, warrantyDecisionNote: "Bearing was replaced in the last rebuild.", condition: "NORMAL" });
    await expect(withdrawWarrantyClaim(form({ workOrderId: second.id }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("has been decided") });

    const history = await prisma.workOrderStatusHistory.findMany({ where: { workOrderId: second.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((entry) => entry.condition)).toEqual(["WARRANTY_REVIEW", "NORMAL"]);
    const events = await prisma.auditEvent.findMany({ where: { workOrderId: second.id, eventType: { startsWith: "warranty." } }, orderBy: { createdAt: "asc" } });
    expect(events.map((event) => event.eventType)).toEqual(["warranty.claim-opened", "warranty.claim-approved"]);
    await prisma.user.update({ where: { id: meId }, data: { canApproveWarranty: false } });
  });

  it("needs an earlier shipped repair, and can be withdrawn while undecided", async () => {
    const otherPump = await prisma.equipment.create({ data: { companyId, productModel: "Warranty Other", serialNumber: `WAR-OTHER-${suffix}` } });
    const alone = await prisma.workOrder.create({ data: { workOrderNumber: `WAR-alone-${suffix}`, companyId, equipmentId: otherPump.id, summary: "alone", serviceStageId: stages.RECEIVED.id, customerFacingStatus: stages.RECEIVED.customerFacingStatus, createdById: meId } });
    await expect(openWarrantyClaim(form({ workOrderId: alone.id, reason: "" }))).resolves.toEqual({ status: "error", message: "This pump has no earlier repair with a ship date, so there's no warranty to claim against." });

    const again = await workOrder("withdraw");
    await expect(openWarrantyClaim(form({ workOrderId: again.id, reason: "" }))).resolves.toMatchObject({ status: "success" });
    await expect(withdrawWarrantyClaim(form({ workOrderId: again.id }))).resolves.toEqual({ status: "success", message: "Warranty claim withdrawn." });
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: again.id } })).toMatchObject({ warrantyClaimOnId: null, warrantyDecision: null, condition: "NORMAL" });
  });
});
