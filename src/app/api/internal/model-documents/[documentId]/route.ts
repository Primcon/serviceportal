import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser } from "@/services/authorization";
import { privateFileResponse } from "@/services/file-response";
import { readPrivateFile } from "@/services/private-storage";

export const dynamic = "force-dynamic";

/** Serves a model's manual or other document to staff. */
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  try {
    await getActiveInternalUser();
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const document = await prisma.modelDocument.findUnique({ where: { id: documentId }, select: { storageKey: true, mimeType: true, fileName: true } }).catch(() => null);
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await readPrivateFile(document.storageKey);
  if (!file) return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  return privateFileResponse(file, document.mimeType, document.fileName);
}
