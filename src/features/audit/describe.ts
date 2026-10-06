/**
 * Turns stored audit events into something a person can read: a plain title for each kind
 * of event, and its recorded details as labelled values or "from → to" changes.
 */

export const auditCategories = {
  "work-orders": { label: "Work orders", prefixes: ["work-order", "work-order-number", "service-update", "internal-note", "finding"] },
  checklist: { label: "Checklist and sign-offs", prefixes: ["checklist", "checklist-step", "checklist-template"] },
  files: { label: "Photos and documents", prefixes: ["photo", "document", "model-document"] },
  records: { label: "Customers, pumps and models", prefixes: ["company", "location", "equipment", "product-model"] },
  access: { label: "Users and access", prefixes: ["user", "user-access", "access-request"] },
  settings: { label: "Settings and reports", prefixes: ["service-stage", "list-option", "service-center", "report", "report-schedule"] },
} as const;

export type AuditCategory = keyof typeof auditCategories;

const titles: Record<string, string> = {
  "work-order.created": "Work order opened",
  "work-order.status-changed": "Stage or condition changed",
  "work-order.details-updated": "Work order details edited",
  "work-order.parts-updated": "Parts and quote edited",
  "work-order.assigned": "Work order handed to someone",
  "work-order.unassigned": "Work order returned to the queue",
  "work-order-number.next-set": "Next work order number set",
  "service-update.posted": "Customer update posted",
  "internal-note.posted": "Internal note posted",
  "finding.created": "Finding recorded",
  "checklist.started": "Checklist started on a job",
  "checklist.overridden": "Manager override: job moved on with steps unsigned",
  "checklist-step.signed": "Checklist step signed",
  "checklist-step.marked-not-applicable": "Checklist step marked not applicable",
  "checklist-step.cleared": "Checklist sign-off cleared",
  "checklist-step.added": "Step added to a checklist",
  "checklist-step.updated": "Checklist step edited",
  "checklist-step.removed": "Step removed from a checklist",
  "checklist-template.created": "Checklist created",
  "checklist-template.updated": "Checklist form details edited",
  "checklist-template.revision-created": "Checklist revision created",
  "checklist-template.activated": "Checklist revision made active",
  "photo.uploaded": "Photo uploaded",
  "photo.updated": "Photo caption, category or sharing changed",
  "photo.deleted": "Photo deleted",
  "photo.original-requested": "Full-size original requested from the archive",
  "document.uploaded": "Document uploaded",
  "document.visibility-changed": "Document sharing changed",
  "document.deleted": "Document deleted",
  "model-document.uploaded": "Model document uploaded",
  "model-document.updated": "Model document edited",
  "model-document.deleted": "Model document deleted",
  "company.created": "Customer added",
  "company.renamed": "Customer renamed",
  "company.archived": "Customer archived",
  "company.restored": "Customer restored",
  "company.merged": "Duplicate customer merged in",
  "location.created": "Location added",
  "location.updated": "Location edited",
  "location.archived": "Location archived",
  "location.restored": "Location restored",
  "equipment.created": "Pump added",
  "equipment.updated": "Pump details corrected",
  "equipment.archived": "Pump archived",
  "equipment.restored": "Pump restored",
  "equipment.merged": "Duplicate pump merged in",
  "product-model.created": "Model added to the catalog",
  "product-model.updated": "Catalog model edited",
  "product-model.merged": "Duplicate model merged in",
  "user.enabled": "User enabled",
  "user.disabled": "User disabled",
  "user.internal-role-changed": "Staff role changed",
  "user-access.granted": "Customer access granted",
  "user-access.invited": "Customer invited to the portal",
  "user.sign-in-link-reset": "Sign-in link reset",
  "user-access.revoked": "Customer access removed",
  "access-request.approved": "Access request approved",
  "access-request.rejected": "Access request rejected",
  "service-stage.updated": "Workflow stage edited",
  "list-option.created": "List option added",
  "list-option.updated": "List option edited",
  "service-center.created": "Service center added",
  "service-center.updated": "Service center edited",
  "report.exported": "Report downloaded",
  "report-schedule.created": "Scheduled report created",
  "report-schedule.paused": "Scheduled report paused",
  "report-schedule.resumed": "Scheduled report resumed",
  "report-schedule.deleted": "Scheduled report deleted",
  "report-schedule.sent": "Scheduled report sent",
  "report-schedule.sent-manually": "Scheduled report sent on request",
};

function words(text: string) {
  const spaced = text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A plain-language title for an event type; unknown types fall back to their words. */
export function eventTitle(eventType: string) {
  return titles[eventType] ?? words(eventType);
}

export function categoryOf(eventType: string): AuditCategory | null {
  const prefix = eventType.split(".")[0];
  return (Object.keys(auditCategories) as AuditCategory[]).find((category) => (auditCategories[category].prefixes as readonly string[]).includes(prefix)) ?? null;
}

const fieldLabels: Record<string, string> = {
  customerPurchaseOrder: "Customer PO",
  locationId: "Location",
  productModelId: "Model",
  productModel: "Model",
  rmaReference: "RMA",
  promisedAt: "Promised date",
  serviceCenterId: "Service center",
  toolId: "Tool ID",
  copperClassification: "Copper / non-copper",
  customerContactName: "Contact name",
  customerContactPhone: "Contact phone",
  customerContactEmail: "Contact email",
  partsKit: "Kit",
  extraLaborHours: "Extra labor hours",
  quotedAt: "Customer quoted",
  partsOrderedAt: "Parts ordered",
  partsReceivedAt: "Parts received",
  partsReceivedById: "Parts received by",
  qa: "QA sign-off",
  movedTo: "Moved to",
  unsignedSteps: "Unsigned steps",
  notApplicableItems: "Marked N/A",
  previousVisibility: "Was",
  previousSerialNumber: "Previous serial",
  previousModel: "Previous model",
  previousName: "Previous name",
  previousManufacturer: "Previous manufacturer",
  duplicateName: "Merged-in record",
  duplicateSerialNumber: "Merged-in serial",
  workOrdersMoved: "Work orders moved",
  pumpsMoved: "Pumps moved",
  pumpsCombined: "Pumps combined",
  pumpsRenamed: "Pumps renamed",
  locationsMoved: "Locations moved",
  loginsMoved: "Customer logins moved",
  filesMoved: "Files moved",
  documentsMoved: "Documents moved",
  originalBytes: "Original size",
  viewingBytes: "Viewing copy size",
  isActive: "Active",
  isRequired: "Required",
  requiresQa: "QA only",
  copiedFromRevision: "Copied from revision",
};

/** Details that are internal references, not useful to a reader. */
const hiddenFields = new Set(["duplicateId", "userId", "companyId", "locationId", "productModelId", "bulkUpload", "from-id", "to-id"]);
const typedFields = new Set(["code", "formNumber", "revision", "label", "name", "duplicateName", "previousName", "step", "reason", "fileName", "reading"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function showValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map((item) => showValue(field, item)).join("; ") : "none";
  if (typeof value === "number") return /Bytes$/.test(field) ? `${(value / (1024 * 1024)).toFixed(value >= 1024 * 1024 ? 1 : 2)} MB` : String(value);
  if (typeof value === "string") {
    // Calendar dates are stored as midnight UTC.
    const date = /^(\d{4})-(\d{2})-(\d{2})T00:00:00\.000Z$/.exec(value);
    if (date) return `${date[2]}/${date[3]}/${date[1]}`;
    if (uuid.test(value)) return "(a record)";
    // Stored choices such as WAITING_ON_PARTS read better as words; codes a person typed are left alone.
    if (/^[A-Z][A-Z_]+$/.test(value) && !typedFields.has(field)) return words(value);
    return value;
  }
  return JSON.stringify(value);
}

export type AuditDetail = { label: string; value: string } | { label: string; from: string; to: string };

/**
 * The details recorded with an event. A value stored as { from, to } is shown as a change;
 * anything else as a labelled value. Internal IDs are left out.
 */
export function describeDetails(metadata: unknown): AuditDetail[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const record = metadata as Record<string, unknown>;
  const details: AuditDetail[] = [];

  // A bare { from, to } pair of plain values is one change, such as the next work order number.
  if (typeof record.from === "number" && typeof record.to === "number") details.push({ label: "Value", from: String(record.from), to: String(record.to) });

  for (const [field, value] of Object.entries(record)) {
    if (hiddenFields.has(field) || field === "from" || field === "to") continue;
    // "previousName" is shown with "name", as one change.
    const previous = /^previous([A-Z])(.*)$/.exec(field);
    if (previous && (previous[1].toLowerCase() + previous[2]) in record) continue;
    const previousField = `previous${field.charAt(0).toUpperCase()}${field.slice(1)}`;
    const label = fieldLabels[field] ?? words(field);

    if (value && typeof value === "object" && !Array.isArray(value) && "from" in value && "to" in value) {
      const change = value as { from: unknown; to: unknown };
      details.push({ label, from: showValue(field, change.from), to: showValue(field, change.to) });
    } else if (previousField in record) {
      const [from, to] = [showValue(field, record[previousField]), showValue(field, value)];
      details.push(from === to ? { label, value: to } : { label, from, to });
    } else if (field === "changed" && Array.isArray(value)) {
      details.push({ label: "Changed", value: value.map((name) => fieldLabels[String(name)] ?? words(String(name))).join(", ") });
    } else if (typeof value === "string" && uuid.test(value)) {
      continue;
    } else {
      details.push({ label, value: showValue(field, value) });
    }
  }
  return details;
}
