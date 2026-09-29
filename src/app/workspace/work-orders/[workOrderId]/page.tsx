import Link from "next/link";
import { WorkOrderCondition } from "@prisma/client";
import { Activity, ArrowLeft, Camera, ChevronLeft, ChevronRight, ClipboardCheck, FilePlus2, FileText, History, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { deleteDocument, updateDocumentVisibility } from "@/features/admin/actions";
import { createCustomerVisiblePhotos, createInternalDocument, createInternalFinding, updateWorkOrderStatus } from "@/features/work-orders/actions";
import { getInternalWorkOrder, getInternalWorkOrderActivity, listActiveServiceStages } from "@/features/work-orders/internal-queries";
import { fieldStyles } from "@/components/ui/styles";
import { formatEnumLabel } from "@/lib/labels";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const photoCategories = ["ARRIVAL", "IDENTIFICATION", "INITIAL_CONDITION", "INSPECTION", "DISASSEMBLY", "FINDINGS", "REPAIR", "REPLACEMENT_PARTS", "TESTING", "FINAL_CONDITION", "SHIPPING"];
const documentTypes = ["CUSTOMER_PO", "REPAIR_QUOTE", "INSPECTION_REPORT", "TEST_REPORT", "FINAL_SERVICE_REPORT", "SHIPPING_DOCUMENTATION", "OTHER"];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default async function InternalWorkOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ workOrderId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireWorkspaceUser();
  const { workOrderId } = await params;
  const resolvedSearchParams = await searchParams;
  const requestedActivityPage = Number(firstParam(resolvedSearchParams.activityPage) ?? "1");
  const activityPage = Number.isFinite(requestedActivityPage) && requestedActivityPage > 0 ? Math.floor(requestedActivityPage) : 1;
  const [workOrder, serviceStages, activity] = await Promise.all([
    getInternalWorkOrder(workOrderId),
    listActiveServiceStages(),
    getInternalWorkOrderActivity(workOrderId, activityPage),
  ]);
  if (!workOrder) notFound();
  const photos = workOrder.attachments.filter((attachment) => attachment.kind === "PHOTO");
  const documents = workOrder.attachments.filter((attachment) => attachment.kind === "DOCUMENT");
  const activityPageCount = Math.max(1, Math.ceil(activity.total / activity.pageSize));
  const currentActivityPage = Math.min(activity.page, activityPageCount);
  const activityHref = (page: number) => `/workspace/work-orders/${workOrder.id}?activityPage=${page}`;

  return (
    <main className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <Link href="/workspace/work-orders" className="flex w-fit items-center gap-2 text-sm font-bold text-brand"><ArrowLeft size={16} /> Work orders</Link>

        <section className="mt-6 border-b border-line pb-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm font-bold tracking-[0.1em] text-danger">{workOrder.workOrderNumber}</p>
              <h1 className="mt-2 text-3xl font-bold">{workOrder.summary}</h1>
              <p className="mt-2 text-muted">{workOrder.company.name} · {workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}</p>
            </div>
            <div className="border-l-4 border-brand pl-4 sm:min-w-52">
              <p className="text-xs font-bold tracking-[0.08em] text-muted">CURRENT SERVICE</p>
              <p className="mt-1 font-bold">{workOrder.serviceStage.displayName}</p>
              <p className="mt-1 text-sm text-muted">{formatEnumLabel(workOrder.condition)}</p>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border border-line bg-white p-6">
            <div className="flex items-center gap-2"><History className="text-brand" size={20} /><h2 className="text-xl font-bold">Status history</h2></div>
            <div className="relative mt-6 ml-2 border-l-2 border-brand-soft">
              {workOrder.statusHistory.length ? workOrder.statusHistory.map((entry) => <article className="relative pb-6 pl-6 last:pb-0" key={entry.id}>
                <span className="absolute -left-[7px] top-1 size-3 rounded-full bg-brand ring-4 ring-white" />
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{entry.serviceStage.displayName}</p><p className="mt-1 text-sm text-muted">{formatEnumLabel(entry.condition)} · {entry.changedBy.displayName}</p></div><time className="text-xs text-muted">{formatDate(entry.createdAt)}</time></div>
                {entry.note && <p className="mt-2 text-sm leading-6 text-body">{entry.note}</p>}
              </article>) : <p className="pl-6 text-sm text-muted">Status changes will appear here.</p>}
            </div>
          </div>

          <aside className="border border-line bg-white p-6">
            <div className="flex items-center gap-2"><ClipboardCheck className="text-brand" size={20} /><h2 className="text-xl font-bold">Update service state</h2></div>
            <p className="mt-2 text-sm leading-6 text-muted">Internal stage and temporary condition are tracked separately from the customer-facing repair status.</p>
            <ActionFeedbackForm action={updateWorkOrderStatus} className="mt-5 grid gap-3" successMessage="Service state updated.">
              <input name="workOrderId" type="hidden" value={workOrder.id} />
              <label className="grid gap-1.5 text-sm font-bold" htmlFor="service-stage">Service stage<select className={fieldStyles} defaultValue={workOrder.serviceStageId} id="service-stage" name="serviceStageId">{serviceStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.displayName}</option>)}</select></label>
              <label className="grid gap-1.5 text-sm font-bold" htmlFor="work-order-condition">Condition<select className={fieldStyles} defaultValue={workOrder.condition} id="work-order-condition" name="condition">{Object.values(WorkOrderCondition).map((condition) => <option key={condition} value={condition}>{formatEnumLabel(condition)}</option>)}</select></label>
              <button className="bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">Save service state</button>
            </ActionFeedbackForm>
          </aside>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-3">
          <div className="border border-line bg-white p-6">
            <div className="flex items-center gap-2"><Camera className="text-brand" size={20} /><h2 className="text-xl font-bold">Customer photos</h2></div>
            <p className="mt-2 text-sm text-muted">Upload categorized service evidence visible to the customer.</p>
            <ActionFeedbackForm action={createCustomerVisiblePhotos} className="mt-5 grid gap-3" successMessage="Photos uploaded.">
              <input name="workOrderId" type="hidden" value={workOrder.id} />
              <label className="grid gap-1.5 text-sm font-bold">Photos<input className={fieldStyles} type="file" name="files" accept="image/*" multiple required /></label>
              <label className="grid gap-1.5 text-sm font-bold">Category<select className={fieldStyles} name="photoCategory" defaultValue="INSPECTION">{photoCategories.map((category) => <option key={category} value={category}>{formatEnumLabel(category)}</option>)}</select></label>
              <button className="flex items-center justify-center gap-2 bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong"><Camera size={16} /> Upload photos</button>
            </ActionFeedbackForm>
            <div className="mt-6 border-t border-line pt-4"><p className="text-xs font-bold tracking-[0.08em] text-muted">UPLOADED PHOTOS · {photos.length}</p>{photos.length ? <div className="mt-3 grid gap-2">{photos.map((attachment) => <div className="border-l-2 border-brand-soft pl-3" key={attachment.id}><p className="break-words text-sm font-bold">{attachment.fileName}</p><p className="mt-1 text-xs text-muted">{attachment.photoCategory ? formatEnumLabel(attachment.photoCategory) : "Uncategorized"} · {Math.ceil(attachment.sizeBytes / 1024)} KB</p></div>)}</div> : <p className="mt-3 text-sm text-muted">No photos uploaded yet.</p>}</div>
          </div>

          <div className="border border-line bg-white p-6">
            <div className="flex items-center gap-2"><FileText className="text-brand" size={20} /><h2 className="text-xl font-bold">Documents</h2></div>
            <p className="mt-2 text-sm text-muted">Store repair documentation and choose what customers can view.</p>
            <ActionFeedbackForm action={createInternalDocument} className="mt-5 grid gap-3" successMessage="Document uploaded.">
              <input name="workOrderId" type="hidden" value={workOrder.id} />
              <label className="grid gap-1.5 text-sm font-bold">Document<input className={fieldStyles} type="file" name="file" required /></label>
              <label className="grid gap-1.5 text-sm font-bold">Document type<select className={fieldStyles} name="documentType" defaultValue="OTHER">{documentTypes.map((documentType) => <option key={documentType} value={documentType}>{formatEnumLabel(documentType)}</option>)}</select></label>
              <label className="grid gap-1.5 text-sm font-bold">Visibility<select className={fieldStyles} name="visibility" defaultValue="INTERNAL_ONLY"><option value="INTERNAL_ONLY">Internal only</option><option value="CUSTOMER_VISIBLE">Visible to customer</option></select></label>
              <button className="flex items-center justify-center gap-2 bg-ink px-3 py-2.5 text-sm font-bold text-white hover:bg-body"><FileText size={16} /> Upload document</button>
            </ActionFeedbackForm>
            <div className="mt-6 border-t border-line pt-4"><p className="text-xs font-bold tracking-[0.08em] text-muted">DOCUMENTS · {documents.length}</p>{documents.length ? <div className="mt-3 grid gap-3">{documents.map((document) => <article className="border-l-2 border-brand-soft pl-3" key={document.id}><div className="flex items-start justify-between gap-3"><a className="break-words text-sm font-bold hover:text-brand" href={`/api/internal/attachments/${document.id}`}>{document.fileName}</a><div className="flex shrink-0 gap-3"><ActionFeedbackForm action={updateDocumentVisibility} successMessage="Visibility updated."><input name="attachmentId" type="hidden" value={document.id} /><input name="visibility" type="hidden" value={document.visibility === "CUSTOMER_VISIBLE" ? "INTERNAL_ONLY" : "CUSTOMER_VISIBLE"} /><button className="text-xs font-bold text-brand">{document.visibility === "CUSTOMER_VISIBLE" ? "Make internal" : "Share"}</button></ActionFeedbackForm><ActionFeedbackForm action={deleteDocument} successMessage="Document deleted."><input name="attachmentId" type="hidden" value={document.id} /><button className="text-xs font-bold text-danger">Delete</button></ActionFeedbackForm></div></div><p className="mt-1 text-xs text-muted">{document.documentType ? formatEnumLabel(document.documentType) : "Other"} · {document.visibility === "CUSTOMER_VISIBLE" ? "Customer visible" : "Internal only"} · {Math.ceil(document.sizeBytes / 1024)} KB</p></article>)}</div> : <p className="mt-3 text-sm text-muted">No documents uploaded yet.</p>}</div>
          </div>

          <div className="border border-line bg-white p-6">
            <div className="flex items-center gap-2"><FilePlus2 className="text-brand" size={20} /><h2 className="text-xl font-bold">Internal findings</h2></div>
            <p className="mt-2 text-sm text-muted">Keep technician observations and repair notes with this work order.</p>
            <ActionFeedbackForm action={createInternalFinding} className="mt-5 grid gap-3" successMessage="Finding added.">
              <input name="workOrderId" type="hidden" value={workOrder.id} />
              <label className="grid gap-1.5 text-sm font-bold">Title<input className={fieldStyles} name="title" required /></label>
              <label className="grid gap-1.5 text-sm font-bold">Finding<textarea className={fieldStyles} name="body" required rows={4} /></label>
              <button className="flex items-center justify-center gap-2 bg-ink px-3 py-2.5 text-sm font-bold text-white hover:bg-body"><Wrench size={16} /> Add finding</button>
            </ActionFeedbackForm>
            <div className="mt-6 border-t border-line pt-4"><p className="text-xs font-bold tracking-[0.08em] text-muted">FINDINGS · {workOrder.findings.length}</p>{workOrder.findings.length ? <div className="mt-3 grid gap-4">{workOrder.findings.map((finding) => <article className="border-l-2 border-brand-soft pl-3" key={finding.id}><p className="text-sm font-bold">{finding.title}</p><p className="mt-2 text-sm leading-6 text-body">{finding.body}</p><p className="mt-2 text-xs text-muted">{finding.createdBy.displayName} · {formatDate(finding.createdAt)}</p></article>)}</div> : <p className="mt-3 text-sm text-muted">No internal findings yet.</p>}</div>
          </div>
        </section>

        <section className="mt-8 border border-line bg-white p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5"><div className="flex items-center gap-2"><Activity className="text-brand" size={20} /><div><h2 className="text-xl font-bold">Activity</h2><p className="mt-1 text-sm text-muted">Audited changes, uploads, and service record actions.</p></div></div><p className="text-sm font-bold text-muted">{activity.total} event{activity.total === 1 ? "" : "s"}</p></div>
          <div className="divide-y divide-line">{activity.events.length ? activity.events.map((event) => <article className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]" key={event.id}><div><p className="font-bold">{event.eventType.replace(".", " - ")}</p><p className="mt-1 text-sm text-muted">{event.actorUser?.displayName ?? "System"} · {event.entityType}</p></div><time className="text-xs text-muted">{formatDate(event.createdAt)}</time></article>) : <p className="py-8 text-sm text-muted">No activity recorded yet.</p>}</div>
          {activityPageCount > 1 && <nav className="mt-5 flex items-center justify-between border-t border-line pt-5 text-sm" aria-label="Work-order activity pagination"><Link className={currentActivityPage > 1 ? "flex items-center gap-1 font-bold text-brand" : "pointer-events-none text-subtle"} href={activityHref(currentActivityPage - 1)}><ChevronLeft size={16} /> Newer</Link><span className="text-muted">Page {currentActivityPage} of {activityPageCount}</span><Link className={currentActivityPage < activityPageCount ? "flex items-center gap-1 font-bold text-brand" : "pointer-events-none text-subtle"} href={activityHref(currentActivityPage + 1)}>Older <ChevronRight size={16} /></Link></nav>}
        </section>
      </div>
    </main>
  );
}