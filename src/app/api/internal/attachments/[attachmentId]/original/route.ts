import { NextResponse } from "next/server";
import { originalRetrievalKey } from "@/features/work-orders/photo-upload";
import { AccessDeniedError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/same-origin";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser } from "@/services/authorization";
import { privateFileState, startArchivedFileRetrieval } from "@/services/private-storage";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

async function photo(attachmentId: string) {
  return prisma.attachment.findFirst({ where: { id: attachmentId, kind: "PHOTO" }, select: { id: true, workOrderId: true, fileName: true, originalStorageKey: true, originalArchivedAt: true } }).catch(() => null);
}

/** Whether a photo's full-size original can be downloaded now: "available", "retrieving" or "archived". */
async function originalState(attachment: { id: string; originalArchivedAt: Date | null }) {
  if (!attachment.originalArchivedAt) return "available" as const;
  const state = await privateFileState(originalRetrievalKey(attachment.id));
  return state === "available" || state === "retrieving" ? state : "archived" as const;
}

/** Reports whether a photo's archived original is ready to download. */
export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    await getActiveInternalUser();
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const attachment = await photo((await params).attachmentId);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ state: await originalState(attachment) }, { headers: noStore });
}

/** Asks for an archived original to be retrieved. Azure takes up to 15 hours; the copy is removed again after a week. */
export async function POST(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const user = await getActiveInternalUser();
    const attachment = await photo((await params).attachmentId);
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let state = await originalState(attachment);
    if (state === "archived") {
      await startArchivedFileRetrieval(attachment.originalStorageKey, originalRetrievalKey(attachment.id));
      await recordAudit(prisma, { workOrderId: attachment.workOrderId, actorUserId: user.id, eventType: "photo.original-requested", entityType: "Attachment", entityId: attachment.id, metadata: { fileName: attachment.fileName } });
      state = await originalState(attachment);
    }
    return NextResponse.json({ state }, { headers: noStore });
  } catch (error) {
    if (error instanceof AccessDeniedError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("Could not start retrieving a photo's original.", error);
    return NextResponse.json({ error: "The original couldn't be requested. Try again." }, { status: 500 });
  }
}
