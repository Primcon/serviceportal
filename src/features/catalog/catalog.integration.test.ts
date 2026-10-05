import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { deleteModelDocument, mergeProductModels, saveProductModel, updateModelDocument, uploadModelDocument } from "@/features/catalog/actions";
import { deletePrivateFile, storePrivateBuffer } from "@/services/private-storage";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/private-storage", () => ({ deletePrivateFile: vi.fn(), readPrivateFile: vi.fn(), storePrivateBuffer: vi.fn(async () => true), storePrivateFile: vi.fn() }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };
let companyId = "";

function form(values: Record<string, string | File>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

function model(name: string) {
  return prisma.productModel.findFirstOrThrow({ where: { name: `${name} ${suffix}` } });
}

const pdf = () => new File([Buffer.from("%PDF-1.7\nmanual")], "IL70N manual.pdf", { type: "application/pdf" });

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
  companyId = (await prisma.company.create({ data: { name: `Catalog Company ${suffix}` } })).id;
});

afterAll(async () => {
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.modelDocument.deleteMany({ where: { productModel: { name: { endsWith: suffix } } } });
  await prisma.productModel.deleteMany({ where: { name: { endsWith: suffix } } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("the model catalog", () => {
  it("adds a model, refuses a duplicate, and renames its pumps when it's corrected", async () => {
    await expect(saveProductModel(form({ manufacturer: "Edwards", name: `IL70 ${suffix}` }))).resolves.toEqual({ status: "success", message: `Edwards IL70 ${suffix} added.` });
    await expect(saveProductModel(form({ manufacturer: "EDWARDS", name: `il70 ${suffix}` }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("already in the catalog") });
    const created = await model("IL70");
    const pump = await prisma.equipment.create({ data: { companyId, productModelId: created.id, productModel: `Edwards IL70 ${suffix}`, serialNumber: `CAT-${suffix}` } });

    await expect(saveProductModel(form({ modelId: created.id, manufacturer: "Edwards", name: `IL70N ${suffix}`, isActiveField: "1", isActive: "on" }))).resolves.toEqual({ status: "success", message: "Model saved." });
    expect((await prisma.equipment.findUniqueOrThrow({ where: { id: pump.id } })).productModel).toBe(`Edwards IL70N ${suffix}`);

    await expect(saveProductModel(form({ modelId: created.id, manufacturer: "Edwards", name: `IL70N ${suffix}`, isActiveField: "1" }))).resolves.toMatchObject({ status: "success" });
    expect((await prisma.productModel.findUniqueOrThrow({ where: { id: created.id } })).isActive).toBe(false);
  });

  it("merges a duplicate model into the one being kept", async () => {
    await saveProductModel(form({ manufacturer: "Busch", name: `R5 ${suffix}` }));
    await saveProductModel(form({ manufacturer: "", name: `R-5 ${suffix}` }));
    const [keep, duplicate] = await Promise.all([model("R5"), model("R-5")]);
    const pump = await prisma.equipment.create({ data: { companyId, productModelId: duplicate.id, productModel: `R-5 ${suffix}`, serialNumber: `MERGE-${suffix}` } });
    await expect(uploadModelDocument(form({ modelId: duplicate.id, title: "", file: pdf() }))).resolves.toEqual({ status: "success", message: "Document uploaded." });

    await expect(mergeProductModels(form({ duplicateId: duplicate.id, keepId: duplicate.id }))).resolves.toEqual({ status: "error", message: "Choose a different model to merge into." });
    await expect(mergeProductModels(form({ duplicateId: duplicate.id, keepId: keep.id }))).resolves.toEqual({ status: "success", message: "Merged. 1 pump moved." });

    expect(await prisma.productModel.findUnique({ where: { id: duplicate.id } })).toBeNull();
    expect(await prisma.equipment.findUniqueOrThrow({ where: { id: pump.id } })).toMatchObject({ productModelId: keep.id, productModel: `Busch R5 ${suffix}` });
    expect(await prisma.modelDocument.count({ where: { productModelId: keep.id } })).toBe(1);
  });

  it("stores, shares and deletes a model's documents", async () => {
    await saveProductModel(form({ manufacturer: "Pfeiffer", name: `HiPace ${suffix}` }));
    const hiPace = await model("HiPace");
    const notAManual = new File([Buffer.from("MZ executable")], "manual.pdf", { type: "application/pdf" });
    await expect(uploadModelDocument(form({ modelId: hiPace.id, title: "Manual", file: notAManual }))).resolves.toMatchObject({ status: "error", message: expect.stringContaining("isn't a supported document type") });
    await expect(uploadModelDocument(form({ modelId: hiPace.id, title: "", file: pdf() }))).resolves.toEqual({ status: "success", message: "Document uploaded." });

    const document = await prisma.modelDocument.findFirstOrThrow({ where: { productModelId: hiPace.id } });
    expect(document).toMatchObject({ title: "IL70N manual", documentType: "MANUAL", visibility: "INTERNAL_ONLY", mimeType: "application/pdf", fileName: "IL70N manual.pdf" });
    expect(vi.mocked(storePrivateBuffer)).toHaveBeenCalledWith(expect.objectContaining({ key: document.storageKey, contentType: "application/pdf" }));

    await expect(updateModelDocument(form({ documentId: document.id, title: "Operating manual", visibility: "CUSTOMER_VISIBLE" }))).resolves.toEqual({ status: "success", message: "Document saved." });
    expect(await prisma.modelDocument.findUniqueOrThrow({ where: { id: document.id } })).toMatchObject({ title: "Operating manual", visibility: "CUSTOMER_VISIBLE" });

    await expect(deleteModelDocument(form({ documentId: document.id }))).resolves.toEqual({ status: "success", message: "Document deleted." });
    expect(await prisma.modelDocument.findUnique({ where: { id: document.id } })).toBeNull();
    expect(vi.mocked(deletePrivateFile)).toHaveBeenCalledWith(document.storageKey);
  });

  it("is limited to managers and administrators", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
    try {
      await expect(saveProductModel(form({ manufacturer: "", name: `Blocked ${suffix}` }))).resolves.toEqual({ status: "error", message: "You don't have permission to do that." });
      await expect(uploadModelDocument(form({ modelId: crypto.randomUUID(), title: "", file: pdf() }))).resolves.toEqual({ status: "error", message: "You don't have permission to do that." });
    } finally {
      process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    }
  });
});
