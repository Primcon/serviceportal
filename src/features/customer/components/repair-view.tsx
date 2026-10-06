import Link from "next/link";
import { AlertCircle, Camera, Download, FileText, Info, Lightbulb, Mail, MessageSquareText, Phone, Star } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles, eyebrowStyles, panelStyles } from "@/components/ui/styles";
import { CustomerPhotoGallery } from "@/features/customer/components/customer-photo-gallery";
import { ProgressTracker } from "@/features/customer/components/progress-tracker";
import { customerConditionNotices, customerStageLabel, progressSteps } from "@/features/customer/progress";
import type { CustomerWorkOrder } from "@/features/work-orders/customer-queries";
import { shopTimeZone } from "@/lib/dates";
import { customerStatusLabels, documentTypeLabels } from "@/lib/labels";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: shopTimeZone });
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: shopTimeZone });
const calendarDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function Section({ icon, title, actions, children }: { icon: ReactNode; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={panelStyles}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">{icon}{title}</h2>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Stage = { sequence: number; displayName: string; customerLabel: string | null; isActive: boolean };

/**
 * A repair as the customer sees it. The customer portal renders this for the customer, and
 * the workspace renders the same thing as a preview for staff. In a preview, files come
 * through the staff routes and links that only work for a signed-in customer are left out.
 */
export function RepairView({ workOrder, stages, preview = false }: { workOrder: CustomerWorkOrder; stages: Stage[]; preview?: boolean }) {
  const filePath = preview ? "/api/internal/attachments" : "/api/attachments";
  const steps = progressSteps(stages, workOrder.serviceStage.sequence);
  // The date each step was first reached, from the stage history.
  const stepDates: Record<string, string> = {};
  for (const entry of workOrder.statusHistory) {
    const label = customerStageLabel(entry.serviceStage);
    if (!stepDates[label]) stepDates[label] = shortDay.format(entry.createdAt);
  }
  const notice = customerConditionNotices[workOrder.condition];
  const photos = workOrder.attachments.filter((attachment) => attachment.kind === "PHOTO");
  // The final service report comes first; it's the document customers come back for.
  const documents = workOrder.attachments.filter((attachment) => attachment.kind === "DOCUMENT").sort((a, b) => Number(b.documentType === "FINAL_SERVICE_REPORT") - Number(a.documentType === "FINAL_SERVICE_REPORT"));
  const contact = workOrder.serviceCenter;
  const facts: [string, ReactNode][] = [
    ["Received", workOrder.receivedAt && day.format(workOrder.receivedAt)],
    ["Expected by", !workOrder.completedAt && workOrder.promisedAt && calendarDay.format(workOrder.promisedAt)],
    ["Completed", workOrder.completedAt && day.format(workOrder.completedAt)],
    ["Your PO", workOrder.customerPurchaseOrder],
    ["RMA", workOrder.rmaReference],
    ["Company", workOrder.company.name],
  ];

  return (
    <>
      <header className="border-b border-line pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={eyebrowStyles}>REPAIR {workOrder.workOrderNumber}</p>
            <h1 className="mt-2 text-3xl font-bold">{workOrder.summary}</h1>
            <p className="mt-2 text-muted">{preview ? <span className="font-bold text-ink">{workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}</span> : <Link className="font-bold text-ink hover:text-brand" href={`/portal/equipment/${workOrder.equipment.id}`}>{workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}</Link>}</p>
          </div>
          <Badge tone={workOrder.customerFacingStatus === "COMPLETED" ? "success" : "brand"}>{workOrder.condition === "CANCELLED" ? "Cancelled" : customerStatusLabels[workOrder.customerFacingStatus]}</Badge>
        </div>
      </header>

      {notice && (
        <div className="mt-6 flex items-start gap-3 border-l-4 border-brand bg-brand-soft px-4 py-3">
          <AlertCircle className="mt-0.5 shrink-0 text-danger" size={18} />
          <div><p className="font-bold">{notice.title}</p><p className="mt-0.5 text-sm text-body">{notice.detail}</p></div>
        </div>
      )}

      {workOrder.condition !== "CANCELLED" && (
        <section aria-label="Repair progress" className={`${panelStyles} mt-6`}>
          <ProgressTracker dates={stepDates} steps={steps} />
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="grid gap-6">
          <Section icon={<MessageSquareText className="text-brand" size={20} />} title="Updates from your service team">
            {workOrder.updates.length ? (
              <ol className="divide-y divide-line border-y border-line">
                {workOrder.updates.map((update, index) => (
                  <li className="py-4" key={update.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="flex items-center gap-2 font-bold">{update.title}{index === 0 && <Badge tone="brand">Latest</Badge>}</h3>
                      <time className="text-xs text-muted" dateTime={update.createdAt.toISOString()}>{day.format(update.createdAt)}</time>
                    </div>
                    <p className="mt-2 whitespace-pre-line leading-7 text-body">{update.body}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted">No updates yet. Your service team posts here as the repair moves along.</p>}
          </Section>

          {workOrder.findings.length > 0 && (
            <Section icon={<Lightbulb className="text-brand" size={20} />} title="What we found">
              <ul className="divide-y divide-line border-y border-line">
                {workOrder.findings.map((finding) => (
                  <li className="py-4" key={finding.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-bold">{finding.title}</h3><time className="text-xs text-muted" dateTime={finding.createdAt.toISOString()}>{day.format(finding.createdAt)}</time></div>
                    <p className="mt-2 whitespace-pre-line leading-7 text-body">{finding.body}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section icon={<Camera className="text-brand" size={20} />} title={`Photos${photos.length ? ` (${photos.length})` : ""}`}>
            {photos.length
              ? <CustomerPhotoGallery filePath={filePath} photos={photos.map((photo) => ({ id: photo.id, fileName: photo.fileName, caption: photo.caption, photoCategory: photo.photoCategory, takenOn: day.format(photo.uploadedAt) }))} />
              : <p className="text-sm text-muted">No photos have been shared yet.</p>}
          </Section>
        </div>

        <aside className="grid gap-6">
          <Section
            actions={!preview && workOrder.attachments.length > 1 && <a className={buttonStyles({ variant: "outline", size: "sm" })} href={`/api/work-orders/${workOrder.id}/files`}><Download size={15} /> Download all</a>}
            icon={<FileText className="text-brand" size={20} />}
            title="Documents"
          >
            {documents.length ? (
              <ul className="divide-y divide-line border-y border-line">
                {documents.map((document) => {
                  const isFinalReport = document.documentType === "FINAL_SERVICE_REPORT";
                  return (
                    <li key={document.id}>
                      <a className={`group flex items-start gap-3 py-3 ${isFinalReport ? "-mx-3 bg-surface px-3" : ""}`} href={`${filePath}/${document.id}`}>
                        {isFinalReport ? <Star className="mt-0.5 shrink-0 text-brand" size={17} /> : <FileText className="mt-0.5 shrink-0 text-muted" size={17} />}
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold group-hover:text-brand">{document.documentType ? documentTypeLabels[document.documentType] : "Document"}</span>
                          <span className="block break-words text-xs text-muted">{document.fileName} · {fileSize(document.sizeBytes)}</span>
                        </span>
                        <Download className="mt-0.5 shrink-0 text-muted group-hover:text-brand" size={16} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">No documents have been shared yet. Quotes, reports and invoices appear here.</p>}
            {!preview && workOrder.attachments.length > 1 && <p className="mt-3 text-xs text-muted">Download all gives you one zip file with every document and photo on this repair.</p>}
          </Section>

          <Section icon={<Info className="text-brand" size={20} />} title="Details">
            <dl className="grid gap-3 text-sm">
              {facts.filter(([, value]) => value).map(([label, value]) => (
                <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3" key={label}><dt className="text-muted">{label}</dt><dd className="break-words font-bold">{value}</dd></div>
              ))}
            </dl>
          </Section>

          {contact && (contact.contactEmail || contact.contactPhone) && (
            <Section icon={<Phone className="text-brand" size={20} />} title="Questions about this repair?">
              <p className="text-sm text-muted">Contact the {contact.name} and mention repair {workOrder.workOrderNumber}.</p>
              <ul className="mt-3 grid gap-2 text-sm font-bold">
                {contact.contactPhone && <li><a className="flex items-center gap-2 hover:text-brand" href={`tel:${contact.contactPhone.replace(/[^\d+]/g, "")}`}><Phone className="text-muted" size={15} /> {contact.contactPhone}</a></li>}
                {contact.contactEmail && <li><a className="flex items-center gap-2 break-all hover:text-brand" href={`mailto:${contact.contactEmail}?subject=${encodeURIComponent(`Repair ${workOrder.workOrderNumber}`)}`}><Mail className="shrink-0 text-muted" size={15} /> {contact.contactEmail}</a></li>}
              </ul>
            </Section>
          )}
        </aside>
      </div>
    </>
  );
}
