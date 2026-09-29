import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { openWorkOrder } from "@/features/work-orders/intake-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const code = Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => String.fromCharCode(65 + (byte % 26))).join("");
const savedEnvironment = { ...process.env };
let companyId = "";
let equipmentId = "";
let centerId = "";

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

/** openWorkOrder redirects to the new work order, which Next.js signals by throwing. */
async function openAndGetId(values: Record<string, string>) {
  try {
    const result = await openWorkOrder(form(values));
    throw new Error(`Expected a redirect, got ${JSON.stringify(result)}`);
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    const match = /\/workspace\/work-orders\/([0-9a-f-]{36})/.exec(digest);
    if (!match) throw error;
    return match[1];
  }
}

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
  const company = await prisma.company.create({ data: { name: `Intake Company ${suffix}` } });
  const equipment = await prisma.equipment.create({ data: { companyId: company.id, productModel: "Intake Model", serialNumber: `INT-${suffix}` } });
  const center = await prisma.serviceCenter.create({ data: { code, name: `Intake center ${suffix}` } });
  companyId = company.id;
  equipmentId = equipment.id;
  centerId = center.id;
});

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.productModel.deleteMany({ where: { name: `Model ${suffix}` } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.serviceCenter.deleteMany({ where: { id: centerId } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("opening a work order at intake", () => {
  it("opens one for a pump in the register, adding the service center suffix and intake details", async () => {
    const id = await openAndGetId({ pumpMode: "existing", equipmentId, number: `7${suffix.replace(/\D/g, "").slice(0, 4)}1`, serviceCenterId: centerId, summary: "Pump rebuild", priority: "Rush", toolId: "ETCH-07", contaminants: "N2", copperClassification: "NON_COPPER", customerContactName: "Mike" });
    const workOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: { statusHistory: true } });
    expect(workOrder.workOrderNumber.endsWith(` ${code}`)).toBe(true);
    expect(workOrder).toMatchObject({ companyId, equipmentId, serviceCenterId: centerId, summary: "Pump rebuild", priority: "Rush", toolId: "ETCH-07", contaminants: "N2", copperClassification: "NON_COPPER", customerContactName: "Mike" });
    expect(workOrder.statusHistory).toHaveLength(1);
    expect(workOrder.receivedAt).not.toBeNull();

    const duplicate = await openWorkOrder(form({ pumpMode: "existing", equipmentId, number: workOrder.workOrderNumber, serviceCenterId: centerId, summary: "Again" }));
    expect(duplicate).toEqual({ status: "error", message: `WIP ${workOrder.workOrderNumber} is already used by another work order.` });
  });

  it("adds a new pump and catalog model on the same form", async () => {
    const id = await openAndGetId({ pumpMode: "new", companyId, productModelId: "__new", newManufacturer: "Edwards", newModelName: `Model ${suffix}`, serialNumber: `NEW-${suffix}`, number: `8${suffix.replace(/\D/g, "").slice(0, 4)}2`, serviceCenterId: centerId, summary: "Evaluation" });
    const workOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: { equipment: { include: { catalogModel: true } } } });
    expect(workOrder.equipment).toMatchObject({ companyId, serialNumber: `NEW-${suffix}`, productModel: `Edwards Model ${suffix}` });
    expect(workOrder.equipment.catalogModel).toMatchObject({ manufacturer: "Edwards", name: `Model ${suffix}` });

    const sameSerial = await openWorkOrder(form({ pumpMode: "new", companyId, productModelId: workOrder.equipment.productModelId!, serialNumber: `new-${suffix}`, number: `9${suffix}`, serviceCenterId: centerId, summary: "Duplicate" }));
    expect(sameSerial).toMatchObject({ status: "error", message: expect.stringContaining("already has a pump with that serial number") });
  });

  it("asks for a pump and a service center", async () => {
    await expect(openWorkOrder(form({ pumpMode: "existing", number: "1", serviceCenterId: centerId, summary: "No pump" }))).resolves.toMatchObject({ status: "error", fieldErrors: { equipmentId: expect.any(String) } });
    await expect(openWorkOrder(form({ pumpMode: "existing", equipmentId, number: `5${suffix}`, summary: "No center" }))).resolves.toEqual({ status: "error", message: "Choose the service center doing the work." });
  });
});
