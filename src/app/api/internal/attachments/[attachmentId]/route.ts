import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser } from "@/services/authorization";
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

  return new NextResponse(new Blob([file.buffer as ArrayBuffer], { type: attachment.mimeType }), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Content-Type": attachment.mimeType,
    },
  });
}
