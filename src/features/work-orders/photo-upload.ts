import type { PhotoCategory, RecordVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/errors";
import { recordAudit } from "@/services/audit";
import { supportedPhotoDescription } from "@/services/file-types";
import { maxPhotoBytes, preparePhoto } from "@/services/photo-processing";
import { deletePrivateFile, storePrivateBuffer } from "@/services/private-storage";

/** Where a readable copy of an archived original is put when staff ask for it. */
export function originalRetrievalKey(attachmentId: string) {
  return `retrievals/${attachmentId}/original`;
}

async function discard(keys: string[]) {
  await Promise.all(keys.map(async (key) => {
    try {
      await deletePrivateFile(key);
    } catch (error) {
      console.error("Could not remove an orphaned upload.", { key, error });
    }
  }));
}

/**
 * Adds one photo to a work order. Everyone views the compressed copy; the original goes to
 * archive storage, where it costs little and can be retrieved if it's ever needed.
 */
export async function storeWorkOrderPhoto(input: {
  workOrder: { id: string; equipmentId: string; serviceStageId: string };
  actorUserId: string;
  fileName: string;
  content: Buffer;
  photoCategory: PhotoCategory;
  visibility: RecordVisibility;
}) {
  const fileName = input.fileName.split(/[\\/]/).pop() || "photo";
  if (input.content.length === 0) throw new UserFacingError(`${fileName} is empty.`);
  if (input.content.length > maxPhotoBytes) throw new UserFacingError(`${fileName} is larger than ${maxPhotoBytes / (1024 * 1024)} MB.`);
  const prepared = await preparePhoto(input.content);
  if (!prepared) throw new UserFacingError(`${fileName} isn't a supported photo. Upload ${supportedPhotoDescription} images.`);

  const prefix = `work-orders/${input.workOrder.id}/${crypto.randomUUID()}`;
  const keys = { original: `${prefix}/original`, optimized: `${prefix}/optimized.webp`, thumbnail: `${prefix}/thumbnail.webp` };
  const stored = await Promise.all([
    storePrivateBuffer({ key: keys.original, content: input.content, contentType: prepared.originalType, archive: true }),
    storePrivateBuffer({ key: keys.optimized, content: prepared.viewing, contentType: "image/webp" }),
    storePrivateBuffer({ key: keys.thumbnail, content: prepared.thumbnail, contentType: "image/webp" }),
  ]).catch(async (error) => {
    await discard(Object.values(keys));
    throw error;
  });
  if (stored.some((result) => !result)) {
    await discard(Object.values(keys));
    throw new UserFacingError("Private file storage is not configured.");
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const attachment = await transaction.attachment.create({
        data: {
          workOrderId: input.workOrder.id,
          equipmentId: input.workOrder.equipmentId,
          serviceStageId: input.workOrder.serviceStageId,
          kind: "PHOTO",
          visibility: input.visibility,
          photoCategory: input.photoCategory,
          originalStorageKey: keys.original,
          originalArchivedAt: new Date(),
          optimizedStorageKey: keys.optimized,
          thumbnailStorageKey: keys.thumbnail,
          fileName,
          mimeType: prepared.originalType,
          sizeBytes: input.content.length,
          uploadedById: input.actorUserId,
        },
        select: { id: true },
      });
      await recordAudit(transaction, {
        workOrderId: input.workOrder.id,
        actorUserId: input.actorUserId,
        eventType: "photo.uploaded",
        entityType: "Attachment",
        entityId: attachment.id,
        customerVisible: input.visibility === "CUSTOMER_VISIBLE",
        metadata: { photoCategory: input.photoCategory, originalBytes: input.content.length, viewingBytes: prepared.viewing.length },
      });
      return attachment;
    });
  } catch (error) {
    await discard(Object.values(keys));
    throw error;
  }
}
