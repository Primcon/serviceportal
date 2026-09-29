import { NextResponse } from "next/server";
import { RecordVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRequestActor } from "@/services/request-actor";
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
    select: { originalStorageKey: true, optimizedStorageKey: true, thumbnailStorageKey: true, mimeType: true, fileName: true },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storageKey = variant === "thumbnail"
    ? attachment.thumbnailStorageKey
    : variant === "optimized"
      ? attachment.optimizedStorageKey
      : attachment.originalStorageKey;
  const file = storageKey ? await readPrivateFile(storageKey) : null;
  const resolvedFile = file ?? (variant ? await readPrivateFile(attachment.originalStorageKey) : null);
  if (!resolvedFile) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  }

  const usingDerivative = Boolean(file);
  const isDerivative = usingDerivative && (variant === "thumbnail" || variant === "optimized");
  const contentType = isDerivative ? "image/webp" : attachment.mimeType;
  return new NextResponse(new Blob([resolvedFile.buffer as ArrayBuffer], { type: contentType }), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${attachment.mimeType.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Content-Type": contentType,
    },
  });
}