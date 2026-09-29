import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser } from "@/services/authorization";
import { privateFileResponse } from "@/services/file-response";
import { readPrivateFile } from "@/services/private-storage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;
  try {
    await getActiveInternalUser();
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, kind: "DOCUMENT" },
    select: { originalStorageKey: true, mimeType: true, fileName: true },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readPrivateFile(attachment.originalStorageKey);
  if (!file) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  }

  return privateFileResponse(file, attachment.mimeType, attachment.fileName);
}
