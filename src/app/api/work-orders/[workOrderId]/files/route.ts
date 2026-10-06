import { NextResponse } from "next/server";
import { RecordVisibility } from "@prisma/client";
import { zipSync, type Zippable } from "fflate";
import { archivePaths } from "@/features/customer/files-archive";
import { prisma } from "@/lib/prisma";
import { customerWorkOrderAccessWhere } from "@/services/authorization-policy";
import { readPrivateFile } from "@/services/private-storage";
import { getRequestActor } from "@/services/request-actor";

export const dynamic = "force-dynamic";

/** Beyond this the download is built in memory at a size that isn't sensible; customers can still open files one by one. */
const maxFiles = 400;
const maxBytes = 400 * 1024 * 1024;

/**
 * Everything shared with the customer on one repair, as a single zip: documents as
 * uploaded, photos as their viewing copies. Only customer-visible files on a work order
 * the customer has access to are included.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });
  const actor = await getRequestActor("customer");
  if (!actor) return notFound;
  const user = await prisma.user.findUnique({ where: { identitySubject: actor.identitySubject }, select: { id: true, isActive: true } });
  if (!user?.isActive) return notFound;

  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, ...customerWorkOrderAccessWhere(user.id) },
    select: {
      workOrderNumber: true,
      attachments: {
        where: { visibility: RecordVisibility.CUSTOMER_VISIBLE, kind: { in: ["PHOTO", "DOCUMENT"] } },
        orderBy: { uploadedAt: "asc" },
        select: { id: true, kind: true, fileName: true, photoCategory: true, documentType: true, originalStorageKey: true, originalArchivedAt: true, optimizedStorageKey: true, sizeBytes: true },
      },
    },
  }).catch(() => null);
  if (!workOrder) return notFound;
  if (!workOrder.attachments.length) return NextResponse.json({ error: "No files have been shared on this repair yet." }, { status: 404 });
  if (workOrder.attachments.length > maxFiles) return NextResponse.json({ error: "This repair has too many files to download at once. Open them individually." }, { status: 413 });

  const paths = new Map(archivePaths(workOrder.attachments).map((entry) => [entry.id, entry.path]));
  const entries: Zippable = {};
  let total = 0;
  for (const attachment of workOrder.attachments) {
    // Photos go in as their viewing copy. An older photo with no viewing copy uses its original, unless that was archived.
    const key = attachment.kind === "PHOTO" ? attachment.optimizedStorageKey ?? (attachment.originalArchivedAt ? null : attachment.originalStorageKey) : attachment.originalStorageKey;
    const content = key ? await readPrivateFile(key) : null;
    if (!content) continue;
    total += content.length;
    if (total > maxBytes) return NextResponse.json({ error: "These files are too large to download at once. Open them individually." }, { status: 413 });
    // Stored without compression: photos and PDFs are already compressed.
    entries[paths.get(attachment.id)!] = [new Uint8Array(content), { level: 0 }];
  }
  if (!Object.keys(entries).length) return NextResponse.json({ error: "The files couldn't be read. Try again." }, { status: 503 });

  const fileName = `${workOrder.workOrderNumber.replace(/[^A-Za-z0-9 _-]/g, "-")} files.zip`;
  return new NextResponse(new Uint8Array(zipSync(entries)), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Type": "application/zip",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
