import { NextResponse } from "next/server";
import { originalRetrievalKey } from "@/features/work-orders/photo-upload";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser } from "@/services/authorization";
import { privateFileResponse } from "@/services/file-response";
import { privateFileState, readPrivateFile } from "@/services/private-storage";

export const dynamic = "force-dynamic";

/**
 * Serves a work order file to staff. Documents are served as stored. Photos are served as
 * their compressed viewing copy, or a thumbnail with ?variant=thumbnail. A photo's full-size
 * original (?variant=original) is in archive storage, so it's only available once a
 * retrieved copy is ready; older photos that were never archived are served directly.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;
  try {
    await getActiveInternalUser();
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, kind: true, originalStorageKey: true, originalArchivedAt: true, optimizedStorageKey: true, thumbnailStorageKey: true, mimeType: true, fileName: true },
  }).catch(() => null);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const variant = new URL(request.url).searchParams.get("variant");
  if (attachment.kind === "PHOTO" && variant !== "original") {
    const derivativeKey = variant === "thumbnail" ? attachment.thumbnailStorageKey : attachment.optimizedStorageKey;
    const derivative = derivativeKey ? await readPrivateFile(derivativeKey) : null;
    if (derivative) return privateFileResponse(derivative, "image/webp", attachment.fileName.replace(/\.[^.]+$/, "") + ".webp");
    // Photos from before derivatives existed fall through to the original.
  }

  let originalKey = attachment.originalStorageKey;
  if (attachment.originalArchivedAt) {
    originalKey = originalRetrievalKey(attachment.id);
    if (await privateFileState(originalKey) !== "available") {
      return NextResponse.json({ error: "This photo's original is in archive storage. Request it from the photo viewer; it takes up to 15 hours." }, { status: 409 });
    }
  }
  const file = await readPrivateFile(originalKey);
  if (!file) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  }
  return privateFileResponse(file, attachment.mimeType, attachment.fileName);
}
