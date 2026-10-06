import type { CustomerFacingStatus, DocumentType, PhotoCategory, RecordVisibility, WorkOrderCondition } from "@prisma/client";

type Actor = { displayName: string } | null;

export type TimelineInput = {
  statusHistory: { id: string; createdAt: Date; condition: WorkOrderCondition; note: string | null; serviceStage: { displayName: string; customerFacingStatus: CustomerFacingStatus }; changedBy: Actor }[];
  updates: { id: string; createdAt: Date; title: string; body: string; visibility: RecordVisibility; notifyCustomer: boolean; createdBy: Actor }[];
  findings: { id: string; createdAt: Date; title: string; body: string; visibility: RecordVisibility; createdBy: Actor }[];
  assignments?: { id: string; createdAt: Date; note: string | null; assignedTo: Actor; assignedBy: Actor }[];
  attachments: { id: string; kind: "PHOTO" | "DOCUMENT"; uploadedAt: Date; fileName: string; photoCategory: PhotoCategory | null; documentType: DocumentType | null; visibility: RecordVisibility; uploadedById: string; uploadedBy: Actor }[];
};

export type TimelineEntry =
  | { kind: "status"; id: string; at: Date; actor: string; stage: string; condition: WorkOrderCondition; customerStatus: CustomerFacingStatus; note: string | null; isFirst: boolean }
  | { kind: "customer-update"; id: string; at: Date; actor: string; title: string; body: string; emailed: boolean }
  | { kind: "internal-note"; id: string; at: Date; actor: string; body: string }
  | { kind: "finding"; id: string; at: Date; actor: string; title: string; body: string; shared: boolean }
  | { kind: "handoff"; id: string; at: Date; actor: string; to: string | null; note: string | null }
  | { kind: "photos"; id: string; at: Date; actor: string; category: PhotoCategory | null; photoIds: string[]; sharedCount: number }
  | { kind: "document"; id: string; at: Date; actor: string; fileName: string; documentType: DocumentType | null; shared: boolean };

/** Photos from the same person in the same category within this window are shown as one entry. */
const photoBatchWindowMilliseconds = 10 * 60 * 1000;

function actorName(actor: Actor) {
  return actor?.displayName ?? "System";
}

/** Merges everything recorded on a work order into one list, newest first. */
export function buildTimeline(input: TimelineInput): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const oldestStatusId = input.statusHistory.reduce<{ id: string; at: number } | null>((oldest, entry) => (!oldest || entry.createdAt.getTime() < oldest.at ? { id: entry.id, at: entry.createdAt.getTime() } : oldest), null)?.id;

  for (const entry of input.statusHistory) {
    entries.push({ kind: "status", id: entry.id, at: entry.createdAt, actor: actorName(entry.changedBy), stage: entry.serviceStage.displayName, condition: entry.condition, customerStatus: entry.serviceStage.customerFacingStatus, note: entry.note, isFirst: entry.id === oldestStatusId });
  }
  for (const update of input.updates) {
    entries.push(update.visibility === "CUSTOMER_VISIBLE"
      ? { kind: "customer-update", id: update.id, at: update.createdAt, actor: actorName(update.createdBy), title: update.title, body: update.body, emailed: update.notifyCustomer }
      : { kind: "internal-note", id: update.id, at: update.createdAt, actor: actorName(update.createdBy), body: update.body });
  }
  for (const assignment of input.assignments ?? []) {
    entries.push({ kind: "handoff", id: assignment.id, at: assignment.createdAt, actor: actorName(assignment.assignedBy), to: assignment.assignedTo?.displayName ?? null, note: assignment.note });
  }
  for (const finding of input.findings) {
    entries.push({ kind: "finding", id: finding.id, at: finding.createdAt, actor: actorName(finding.createdBy), title: finding.title, body: finding.body, shared: finding.visibility === "CUSTOMER_VISIBLE" });
  }

  const photos = input.attachments.filter((attachment) => attachment.kind === "PHOTO").sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
  let batch: Extract<TimelineEntry, { kind: "photos" }> | null = null;
  let batchUploader = "";
  let batchStart = 0;
  for (const photo of photos) {
    const joinsBatch = batch && photo.uploadedById === batchUploader && photo.photoCategory === batch.category && photo.uploadedAt.getTime() - batchStart <= photoBatchWindowMilliseconds;
    if (!batch || !joinsBatch) {
      batch = { kind: "photos", id: photo.id, at: photo.uploadedAt, actor: actorName(photo.uploadedBy), category: photo.photoCategory, photoIds: [], sharedCount: 0 };
      batchUploader = photo.uploadedById;
      batchStart = photo.uploadedAt.getTime();
      entries.push(batch);
    }
    batch.photoIds.push(photo.id);
    batch.at = photo.uploadedAt;
    if (photo.visibility === "CUSTOMER_VISIBLE") batch.sharedCount += 1;
  }

  for (const document of input.attachments.filter((attachment) => attachment.kind === "DOCUMENT")) {
    entries.push({ kind: "document", id: document.id, at: document.uploadedAt, actor: actorName(document.uploadedBy), fileName: document.fileName, documentType: document.documentType, shared: document.visibility === "CUSTOMER_VISIBLE" });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}
