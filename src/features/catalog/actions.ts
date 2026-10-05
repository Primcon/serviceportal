"use server";

import { revalidatePath } from "next/cache";
import { DocumentType, RecordVisibility } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { managerRoles } from "@/features/navigation/workspace-items";
import { modelDisplayName } from "@/features/work-orders/intake";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUserForRoles } from "@/services/authorization";
import { detectDocumentType, supportedDocumentDescription } from "@/services/file-types";
import { deletePrivateFile, storePrivateBuffer } from "@/services/private-storage";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

const id = z.string().uuid();
const maxDocumentBytes = 50 * 1024 * 1024;

function revalidateCatalog() {
  revalidatePath("/workspace", "layout");
  revalidatePath("/portal", "layout");
}

async function removeStoredFile(key: string) {
  try {
    await deletePrivateFile(key);
  } catch (error) {
    console.error("A model document's file could not be removed from storage.", { key, error });
  }
}

/** Adds a catalog model, or corrects its manufacturer or name, or retires it from pickers. */
export async function saveProductModel(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      modelId: z.string().trim().uuid().or(z.literal("")).transform((text) => text || null),
      manufacturer: z.string().trim().max(80).transform((text) => text || null),
      name: z.string().trim().min(1).max(120),
      isActive: z.boolean(),
    }).parse({
      modelId: value(formData, "modelId"),
      manufacturer: value(formData, "manufacturer"),
      name: value(formData, "name"),
      isActive: formData.get("isActive") === "on" || !formData.has("isActiveField"),
    });
    const actor = await getActiveInternalUserForRoles(managerRoles);

    await prisma.$transaction(async (transaction) => {
      const sameModel = await transaction.productModel.findFirst({
        where: {
          ...(input.modelId ? { id: { not: input.modelId } } : {}),
          name: { equals: input.name, mode: "insensitive" },
          ...(input.manufacturer ? { manufacturer: { equals: input.manufacturer, mode: "insensitive" } } : { manufacturer: null }),
        },
        select: { id: true },
      });
      if (sameModel) throw new UserFacingError(`${modelDisplayName(input.manufacturer, input.name)} is already in the catalog.${input.modelId ? " If they're the same model, merge them instead." : ""}`);

      const data = { manufacturer: input.manufacturer, name: input.name, isActive: input.isActive };
      if (!input.modelId) {
        const model = await transaction.productModel.create({ data });
        await recordAudit(transaction, { actorUserId: actor.id, eventType: "product-model.created", entityType: "ProductModel", entityId: model.id, metadata: data });
        return;
      }
      const existing = await transaction.productModel.findUnique({ where: { id: input.modelId } });
      if (!existing) throw new UserFacingError("Model not found.");
      await transaction.productModel.update({ where: { id: existing.id }, data });
      // Each pump stores its model's display name for searching, so keep those in step.
      const displayName = modelDisplayName(input.manufacturer, input.name);
      const renamed = displayName === modelDisplayName(existing.manufacturer, existing.name)
        ? { count: 0 }
        : await transaction.equipment.updateMany({ where: { productModelId: existing.id }, data: { productModel: displayName } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "product-model.updated", entityType: "ProductModel", entityId: existing.id, metadata: { ...data, previousManufacturer: existing.manufacturer, previousName: existing.name, pumpsRenamed: renamed.count } });
    });
    revalidateCatalog();
    return input.modelId ? "Model saved." : `${modelDisplayName(input.manufacturer, input.name)} added.`;
  });
}

/** Merges a duplicate catalog model into the one being kept: its pumps and documents move across, then it's removed. */
export async function mergeProductModels(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ duplicateId: id, keepId: z.string().uuid("Choose the model to keep.") }).parse({ duplicateId: value(formData, "duplicateId"), keepId: value(formData, "keepId") });
    if (input.duplicateId === input.keepId) throw new UserFacingError("Choose a different model to merge into.");
    const actor = await getActiveInternalUserForRoles(managerRoles);

    const moved = await prisma.$transaction(async (transaction) => {
      const [duplicate, keep] = await Promise.all([
        transaction.productModel.findUnique({ where: { id: input.duplicateId } }),
        transaction.productModel.findUnique({ where: { id: input.keepId } }),
      ]);
      if (!duplicate || !keep) throw new UserFacingError("Model not found.");
      const pumps = await transaction.equipment.updateMany({ where: { productModelId: duplicate.id }, data: { productModelId: keep.id, productModel: modelDisplayName(keep.manufacturer, keep.name) } });
      const documents = await transaction.modelDocument.updateMany({ where: { productModelId: duplicate.id }, data: { productModelId: keep.id } });
      await transaction.productModel.delete({ where: { id: duplicate.id } });
      await recordAudit(transaction, {
        actorUserId: actor.id,
        eventType: "product-model.merged",
        entityType: "ProductModel",
        entityId: keep.id,
        metadata: { duplicateId: duplicate.id, duplicateName: modelDisplayName(duplicate.manufacturer, duplicate.name), pumpsMoved: pumps.count, documentsMoved: documents.count },
      });
      return pumps.count;
    });
    revalidateCatalog();
    return `Merged. ${moved} pump${moved === 1 ? "" : "s"} moved.`;
  });
}

/** Attaches a manual or other document to a model, for every pump of that model. */
export async function uploadModelDocument(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      modelId: id,
      title: z.string().trim().max(160),
      documentType: z.nativeEnum(DocumentType),
      visibility: z.nativeEnum(RecordVisibility),
    }).parse({
      modelId: value(formData, "modelId"),
      title: value(formData, "title"),
      documentType: value(formData, "documentType") || DocumentType.MANUAL,
      visibility: value(formData, "visibility") || RecordVisibility.INTERNAL_ONLY,
    });
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserFacingError("Choose a file to upload.");
    if (file.size > maxDocumentBytes) throw new UserFacingError("Documents must be 50 MB or smaller.");
    const actor = await getActiveInternalUserForRoles(managerRoles);
    const model = await prisma.productModel.findUnique({ where: { id: input.modelId }, select: { id: true } });
    if (!model) throw new UserFacingError("Model not found.");

    const content = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.split(/[\\/]/).pop() || "document";
    const mimeType = detectDocumentType(content, fileName);
    if (!mimeType) throw new UserFacingError(`${fileName} isn't a supported document type. Upload ${supportedDocumentDescription}.`);
    const storageKey = `models/${model.id}/${crypto.randomUUID()}/original`;
    const stored = await storePrivateBuffer({ key: storageKey, content, contentType: mimeType });
    if (!stored) throw new UserFacingError("Private file storage is not configured.");

    try {
      await prisma.$transaction(async (transaction) => {
        const document = await transaction.modelDocument.create({
          data: { productModelId: model.id, title: input.title || fileName.replace(/\.[^.]+$/, ""), documentType: input.documentType, visibility: input.visibility, storageKey, fileName, mimeType, sizeBytes: file.size, uploadedById: actor.id },
        });
        await recordAudit(transaction, { actorUserId: actor.id, eventType: "model-document.uploaded", entityType: "ModelDocument", entityId: document.id, customerVisible: input.visibility === "CUSTOMER_VISIBLE", metadata: { productModelId: model.id, fileName } });
      });
    } catch (error) {
      await removeStoredFile(storageKey);
      throw error;
    }
    revalidateCatalog();
    return "Document uploaded.";
  });
}

/** Renames a model document or changes whether customers can see it. */
export async function updateModelDocument(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ documentId: id, title: z.string().trim().min(1).max(160), visibility: z.nativeEnum(RecordVisibility) }).parse({
      documentId: value(formData, "documentId"),
      title: value(formData, "title"),
      visibility: value(formData, "visibility"),
    });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const document = await transaction.modelDocument.findUnique({ where: { id: input.documentId } });
      if (!document) throw new UserFacingError("Document not found.");
      if (document.title === input.title && document.visibility === input.visibility) return;
      await transaction.modelDocument.update({ where: { id: document.id }, data: { title: input.title, visibility: input.visibility } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "model-document.updated", entityType: "ModelDocument", entityId: document.id, customerVisible: input.visibility === "CUSTOMER_VISIBLE", metadata: { previousVisibility: document.visibility, visibility: input.visibility } });
    });
    revalidateCatalog();
    return "Document saved.";
  });
}

export async function deleteModelDocument(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const documentId = id.parse(value(formData, "documentId"));
    const actor = await getActiveInternalUserForRoles(managerRoles);
    // Remove the record first: a failed file deletion then leaves an unreferenced file,
    // never a document entry that points at a missing file.
    const document = await prisma.$transaction(async (transaction) => {
      const found = await transaction.modelDocument.findUnique({ where: { id: documentId } });
      if (!found) throw new UserFacingError("Document not found.");
      await transaction.modelDocument.delete({ where: { id: found.id } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "model-document.deleted", entityType: "ModelDocument", entityId: found.id, metadata: { productModelId: found.productModelId, fileName: found.fileName } });
      return found;
    });
    await removeStoredFile(document.storageKey);
    revalidateCatalog();
    return "Document deleted.";
  });
}
