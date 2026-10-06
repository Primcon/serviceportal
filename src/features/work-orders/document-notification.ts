import type { DocumentType, Prisma } from "@prisma/client";
import { documentTypeLabels } from "@/lib/labels";
import { logCustomerNotification } from "@/services/notifications";

/**
 * Tells the customer a document has been shared on their repair. The event is keyed to the
 * document, so sharing, hiding and sharing it again notifies them only once.
 */
export async function notifyDocumentShared(transaction: Prisma.TransactionClient, document: { id: string; workOrderId: string; documentType: DocumentType | null; fileName: string }) {
  const workOrder = await transaction.workOrder.findUnique({ where: { id: document.workOrderId }, select: { companyId: true, workOrderNumber: true } });
  if (!workOrder) return 0;
  const type = document.documentType ? documentTypeLabels[document.documentType] : "Document";
  return logCustomerNotification(transaction, {
    companyId: workOrder.companyId,
    workOrderId: document.workOrderId,
    kind: "DOCUMENT_SHARED",
    eventKey: `document-shared:${document.id}`,
    subject: `Repair ${workOrder.workOrderNumber}: ${type.toLowerCase()} available`,
    body: `A new document has been added to your repair ${workOrder.workOrderNumber}: ${type} (${document.fileName}).`,
  });
}
