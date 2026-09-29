import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser } from "@/services/authorization";
import { privateFileResponse } from "@/services/file-response";
import { readPrivateFile } from "@/services/private-storage";

export const dynamic = "force-dynamic";

/**
 * Serves any work order file to staff. Photos can be requested as a small thumbnail or a
 * screen-sized version (?variant=thumbnail|optimized); older photos without those fall
 * back to the original.
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
    select: { kind: true, originalStorageKey: true, optimizedStorageKey: true, thumbnailStorageKey: true, mimeType: true, fileName: true },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const variant = new URL(request.url).searchParams.get("variant");
  const variantKey = attachment.kind === "PHOTO"
    ? variant === "thumbnail" ? attachment.thumbnailStorageKey : variant === "optimized" ? attachment.optimizedStorageKey : null
    : null;
  const derivative = variantKey ? await readPrivateFile(variantKey) : null;
  const file = derivative ?? await readPrivateFile(attachment.originalStorageKey);
  if (!file) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  }

  return privateFileResponse(file, derivative ? "image/webp" : attachment.mimeType, attachment.fileName);
}
