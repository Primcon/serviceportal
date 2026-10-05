import { NextResponse } from "next/server";
import { RecordVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRequestActor } from "@/services/request-actor";
import { privateFileResponse } from "@/services/file-response";
import { readPrivateFile } from "@/services/private-storage";
import { customerWorkOrderAccessWhere } from "@/services/authorization-policy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;
  const variant = new URL(request.url).searchParams.get("variant");
  const actor = await getRequestActor("customer");
  if (!actor) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await prisma.user.findUnique({
    where: { identitySubject: actor.identitySubject },
    select: { id: true, isActive: true },
  });

  if (!user?.isActive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      kind: { in: ["PHOTO", "DOCUMENT"] },
      visibility: RecordVisibility.CUSTOMER_VISIBLE,
      workOrder: {
        ...customerWorkOrderAccessWhere(user.id),
      },
    },
    select: { kind: true, originalStorageKey: true, originalArchivedAt: true, optimizedStorageKey: true, thumbnailStorageKey: true, mimeType: true, fileName: true },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Customers get a photo's compressed viewing copy or thumbnail, never the archived original.
  if (attachment.kind === "PHOTO") {
    const derivativeKey = variant === "thumbnail" ? attachment.thumbnailStorageKey : attachment.optimizedStorageKey;
    const derivative = derivativeKey ? await readPrivateFile(derivativeKey) : null;
    if (derivative) return privateFileResponse(derivative, "image/webp", attachment.fileName.replace(/.[^.]+$/, "") + ".webp");
    // Photos from before viewing copies existed have only an original, which was never archived.
    if (attachment.originalArchivedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readPrivateFile(attachment.originalStorageKey);
  if (!file) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  }
  return privateFileResponse(file, attachment.mimeType, attachment.fileName);
}
