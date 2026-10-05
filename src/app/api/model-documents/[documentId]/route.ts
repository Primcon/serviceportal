import { NextResponse } from "next/server";
import { RecordVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { customerEquipmentAccessWhere } from "@/services/authorization-policy";
import { privateFileResponse } from "@/services/file-response";
import { readPrivateFile } from "@/services/private-storage";
import { getRequestActor } from "@/services/request-actor";

export const dynamic = "force-dynamic";

/**
 * Serves a model document to a customer. It must be marked customer-visible, and the
 * customer must have a pump of that model.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });
  const actor = await getRequestActor("customer");
  if (!actor) return notFound;
  const user = await prisma.user.findUnique({ where: { identitySubject: actor.identitySubject }, select: { id: true, isActive: true } });
  if (!user?.isActive) return notFound;

  const document = await prisma.modelDocument.findFirst({
    where: {
      id: documentId,
      visibility: RecordVisibility.CUSTOMER_VISIBLE,
      productModel: { equipment: { some: { mergedIntoId: null, ...customerEquipmentAccessWhere(user.id) } } },
    },
    select: { storageKey: true, mimeType: true, fileName: true },
  }).catch(() => null);
  if (!document) return notFound;
  const file = await readPrivateFile(document.storageKey);
  if (!file) return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  return privateFileResponse(file, document.mimeType, document.fileName);
}
