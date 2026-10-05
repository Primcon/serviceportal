import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findCustomerModelDocument } from "@/features/catalog/queries";
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

  const document = await findCustomerModelDocument(user.id, documentId).catch(() => null);
  if (!document) return notFound;
  const file = await readPrivateFile(document.storageKey);
  if (!file) return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  return privateFileResponse(file, document.mimeType, document.fileName);
}
