import type { Prisma, RecordVisibility } from "@prisma/client";
import { modelDisplayName } from "@/features/work-orders/intake";
import { pageWindow } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

const documentSelect = { id: true, title: true, documentType: true, visibility: true, fileName: true, sizeBytes: true, uploadedAt: true, uploadedBy: { select: { displayName: true } } } satisfies Prisma.ModelDocumentSelect;

/** A page of the model catalog, with how many pumps and documents each model has. */
export async function listProductModels({ search = "", page = 1, pageSize = 25, includeRetired = false } = {}) {
  const where: Prisma.ProductModelWhereInput = {
    ...(includeRetired ? {} : { isActive: true }),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { manufacturer: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [total, models] = await Promise.all([
    prisma.productModel.count({ where }),
    prisma.productModel.findMany({
      where,
      orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
      ...pageWindow(page, pageSize),
      select: { id: true, manufacturer: true, name: true, isActive: true, _count: { select: { equipment: { where: { mergedIntoId: null } }, documents: true } } },
    }),
  ]);
  return { models, total, page, pageSize };
}

export function getProductModel(modelId: string) {
  return prisma.productModel.findUnique({
    where: { id: modelId },
    select: {
      id: true,
      manufacturer: true,
      name: true,
      isActive: true,
      documents: { orderBy: [{ documentType: "asc" }, { title: "asc" }], select: documentSelect },
      _count: { select: { equipment: { where: { mergedIntoId: null } } } },
    },
  });
}

/** Active catalog models for a picker, labelled "Manufacturer Model". */
export async function productModelOptions() {
  const models = await prisma.productModel.findMany({ where: { isActive: true }, orderBy: [{ manufacturer: "asc" }, { name: "asc" }], select: { id: true, manufacturer: true, name: true } });
  return models.map((model) => ({ id: model.id, label: modelDisplayName(model.manufacturer, model.name) }));
}

/** The documents attached to a model, optionally only those customers may see. */
export function modelDocuments(productModelId: string | null, visibility?: RecordVisibility) {
  if (!productModelId) return Promise.resolve([]);
  return prisma.modelDocument.findMany({
    where: { productModelId, ...(visibility ? { visibility } : {}) },
    orderBy: [{ documentType: "asc" }, { title: "asc" }],
    select: documentSelect,
  });
}
