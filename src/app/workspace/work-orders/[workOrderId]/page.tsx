import Link from "next/link";
import { notFound } from "next/navigation";
import { ListKind, UserRole, WorkOrderCondition } from "@prisma/client";
import { AlertTriangle, ArrowLeft, BookOpen, Camera, Eye, Hand, ListChecks, PackageSearch, Printer, ClipboardCheck, FileText, History, Info, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { buttonStyles, fieldStyles, panelStyles } from "@/components/ui/styles";
import { deleteDocument, updateDocumentVisibility } from "@/features/admin/actions";
import { assignWorkOrder } from "@/features/assignments/actions";
import { startChecklist } from "@/features/checklists/actions";
import { canSignQaSteps, getWorkOrderChecklist, initials } from "@/features/checklists/checklist";
import { ChecklistPanel } from "@/features/checklists/components/checklist-panel";
import { assignableStaff } from "@/features/assignments/assign";
import { wholeDaysSince } from "@/features/work-orders/queue";
import { ModelDocumentList } from "@/features/catalog/components/model-document-list";
import { modelDocuments } from "@/features/catalog/queries";
import { ClaimDecision, OpenClaimButton, ShippingEditor } from "@/features/warranty/components/warranty-tools";
import { canApproveWarranty, previousShippedRepair, standardWarrantyFor } from "@/features/warranty/queries";
import { shopToday, warrantyLengthLabel, warrantyState } from "@/features/warranty/warranty";
import { createInternalDocument, updateWorkOrderStatus } from "@/features/work-orders/actions";
import { DetailsEditor } from "@/features/work-orders/components/details-editor";
import { PartsEditor } from "@/features/work-orders/components/parts-editor";
import { PhotoGallery } from "@/features/work-orders/components/photo-gallery";
import { TimelineComposer } from "@/features/work-orders/components/timeline-composer";
import { TimelineList } from "@/features/work-orders/components/timeline-list";
import { getInternalWorkOrder, listActiveServiceStages } from "@/features/work-orders/internal-queries";
import { buildTimeline } from "@/features/work-orders/timeline";
import { listOptions, serviceCenters } from "@/features/settings/queries";
import { copperClassificationLabels, customerStatusLabels, documentTypeLabels, formatEnumLabel, isElevatedPriority, partsKitLabels } from "@/lib/labels";
import { firstParam, type SearchParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";
import { shopTimeZone } from "@/lib/dates";

export const dynamic = "force-dynamic";

const dateOnly = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: shopTimeZone });
const signedOn = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: shopTimeZone });

/** A stored calendar date in the yyyy-mm-dd form a date input uses. */
function dateInput(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function Section({ id, icon, title, actions, children, className = "" }: { id?: string; icon: ReactNode; title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${panelStyles} ${className}`} id={id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">{icon}{title}</h2>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {items.map(([label, value]) => (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3" key={label}>
          <dt className="text-muted">{label}</dt>
          <dd className="break-words font-bold">{value || <span className="font-normal text-subtle">Not recorded</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function InternalWorkOrderPage({ params, searchParams }: { params: Promise<{ workOrderId: string }>; searchParams: Promise<SearchParams> }) {
  const viewer = await requireWorkspaceUser();
  const { workOrderId } = await params;
  const initialPhotoId = firstParam((await searchParams).photo);
  const workOrder = await getInternalWorkOrder(workOrderId);
  if (!workOrder) notFound();

  const [stages, priorities, serviceTypes, centers, manuals, staff, checklist, standardWarranty, viewerApprovesWarranty, previousRepair, customerPortalUsers] = await Promise.all([
    listActiveServiceStages(),
    listOptions(ListKind.PRIORITY),
    listOptions(ListKind.SERVICE_TYPE),
    serviceCenters(),
    modelDocuments(workOrder.equipment.productModelId),
    assignableStaff(),
    getWorkOrderChecklist(workOrder.id, workOrder.checklistTemplateId),
    standardWarrantyFor(prisma, workOrder.id),
    canApproveWarranty(viewer.id),
    previousShippedRepair(prisma, workOrder),
    prisma.userAccess.count({
      where: {
        companyId: workOrder.companyId,
        role: UserRole.CUSTOMER_USER,
        user: { isActive: true },
        OR: [{ scope: "COMPANY" }, ...(workOrder.locationId ? [{ scope: "LOCATION" as const, locationId: workOrder.locationId }] : [])],
      },
    }),
  ]);
  const isManager = viewer.internalRole === UserRole.PORTAL_ADMINISTRATOR || viewer.internalRole === UserRole.VACTECH_MANAGER;
  const timeline = buildTimeline({ ...workOrder, attachments: workOrder.attachments });
  const photos = workOrder.attachments.filter((attachment) => attachment.kind === "PHOTO").map((photo) => ({
    id: photo.id,
    fileName: photo.fileName,
    caption: photo.caption,
    photoCategory: photo.photoCategory,
    visibility: photo.visibility,
    uploadedOn: dateTime.format(photo.uploadedAt),
    uploadedBy: photo.uploadedBy.displayName,
    canDelete: isManager || photo.uploadedById === viewer.id,
  }));
  const documents = workOrder.attachments.filter((attachment) => attachment.kind === "DOCUMENT");
  const isClosed = Boolean(workOrder.completedAt) || workOrder.condition === "CANCELLED";
  const isMine = workOrder.assignedToId === viewer.id;
  const daysInStage = wholeDaysSince(workOrder.stageEnteredAt);
  const signedSteps = checklist?.steps.filter((step) => step.record).length ?? 0;
  const handlingWarning = workOrder.copperClassification !== "UNKNOWN" || workOrder.contaminants;
  // Warranty: this repair's own cover, and whether the pump came back inside the cover of its last repair.
  const today = shopToday();
  const ownWarranty = warrantyState(workOrder.warrantyEndsAt, today);
  const warrantyMonths = workOrder.warrantyMonths ?? standardWarranty.months;
  const standardNote = standardWarranty.months === null ? "none set for this model or customer" : `${warrantyLengthLabel(standardWarranty.months)}, from the ${standardWarranty.source === "contract" ? "customer's contract" : "model"}`;
  const arrivedOn = shopToday(workOrder.receivedAt ?? workOrder.createdAt);
  const claimTarget = workOrder.warrantyClaimOn ?? previousRepair;
  const arrivedInWarranty = claimTarget ? warrantyState(claimTarget.warrantyEndsAt, arrivedOn) === "active" : false;
  const claimDecisionLabels = { PENDING: "Waiting for a decision", APPROVED: "Approved: covered by warranty", DENIED: "Denied: not covered" } as const;

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link className="flex w-fit items-center gap-2 text-sm font-bold text-brand" href="/workspace/work-orders"><ArrowLeft size={16} /> Work orders</Link>

      <header className="mt-5 border-b border-line pb-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold tracking-[0.1em] text-danger">{workOrder.workOrderNumber}</p>
              {isElevatedPriority(workOrder.priority) && <Badge tone="danger">{workOrder.priority}</Badge>}
              {workOrder.serviceType && <Badge tone="outline">{workOrder.serviceType}</Badge>}
              {workOrder.condition !== "NORMAL" && <Badge tone="outline">{formatEnumLabel(workOrder.condition)}</Badge>}
            </div>
            <h1 className="mt-2 text-3xl font-bold">{workOrder.summary}</h1>
            <p className="mt-2 text-muted">
              {isManager ? <Link className="hover:text-brand" href={`/workspace/customers/${workOrder.companyId}`}>{workOrder.company.name}</Link> : workOrder.company.name}{workOrder.location && ` · ${workOrder.location.name}`} · <Link className="font-bold text-ink hover:text-brand" href={`/workspace/equipment/${workOrder.equipment.id}`}>{workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}</Link>
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="border-l-4 border-brand pl-4 sm:min-w-52">
              <p className="text-xs font-bold tracking-[0.08em] text-muted">CURRENT STAGE</p>
              <p className="mt-1 font-bold">{workOrder.serviceStage.displayName}</p>
              <p className="mt-0.5 text-sm text-muted">Customer sees: {customerStatusLabels[workOrder.customerFacingStatus]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className={buttonStyles({ variant: "outline", size: "sm" })} href={`/workspace/work-orders/${workOrder.id}/traveler`}><Printer size={15} /> Traveler</Link>
              <Link className={buttonStyles({ variant: "outline", size: "sm" })} href={`/workspace/work-orders/${workOrder.id}/customer-view`}><Eye size={15} /> Customer view</Link>
            <DetailsEditor
              details={{
                id: workOrder.id,
                summary: workOrder.summary,
                priority: workOrder.priority,
                serviceType: workOrder.serviceType,
                customerPurchaseOrder: workOrder.customerPurchaseOrder,
                rmaReference: workOrder.rmaReference,
                promisedAt: workOrder.promisedAt?.toISOString().slice(0, 10) ?? null,
                serviceCenterId: workOrder.serviceCenterId,
                toolId: workOrder.toolId,
                oilType: workOrder.oilType,
                oilWeight: workOrder.oilWeight,
                reasonForService: workOrder.reasonForService,
                contaminants: workOrder.contaminants,
                copperClassification: workOrder.copperClassification,
                accessoriesReceived: workOrder.accessoriesReceived,
                customerContactName: workOrder.customerContactName,
                customerContactPhone: workOrder.customerContactPhone,
                customerContactEmail: workOrder.customerContactEmail,
              }}
              priorities={priorities}
              serviceCenters={centers}
              serviceTypes={serviceTypes}
            />
            </div>
          </div>
        </div>
        {arrivedInWarranty && !workOrder.warrantyClaimOn && !isClosed && claimTarget && (
          <p className="mt-5 flex flex-wrap items-center gap-2 border-l-4 border-brand bg-brand-soft px-4 py-2.5 text-sm">
            <ShieldCheck className="shrink-0 text-brand" size={18} />
            <span>This pump came back inside the warranty on <Link className="font-bold hover:text-brand" href={`/workspace/work-orders/${claimTarget.id}`}>WIP {claimTarget.workOrderNumber}</Link>, which covers it until {dateOnly.format(claimTarget.warrantyEndsAt!)}. <a className="font-bold text-brand" href="#warranty">Open a warranty claim</a> if this is the same fault.</span>
          </p>
        )}
        {handlingWarning && (
          <p className="mt-5 flex items-center gap-2 border-2 border-brand bg-danger-soft px-4 py-2.5 text-sm font-bold text-danger">
            <AlertTriangle className="shrink-0" size={18} />
            {[workOrder.copperClassification !== "UNKNOWN" && copperClassificationLabels[workOrder.copperClassification].toUpperCase(), workOrder.contaminants && `Contaminants: ${workOrder.contaminants}`].filter(Boolean).join(" · ")}
          </p>
        )}
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid content-start gap-6">
          <Section
            actions={checklist && <p className="text-sm text-muted">{signedSteps} of {checklist.steps.length} signed · Form {checklist.formNumber} Rev. {checklist.revision}</p>}
            icon={<ListChecks className="text-brand" size={20} />}
            id="checklist"
            title="Checklist"
          >
            {checklist ? (
              <ChecklistPanel
                canSignQa={canSignQaSteps(viewer.internalRole)}
                currentStageId={workOrder.serviceStageId}
                isClosed={isClosed}
                isManager={isManager}
                steps={checklist.steps.map((step) => ({
                  id: step.id,
                  label: step.label,
                  type: step.type,
                  unit: step.unit,
                  items: step.items,
                  requiresQa: step.requiresQa,
                  isRequired: step.isRequired,
                  stageId: step.serviceStage.id,
                  stageName: step.serviceStage.displayName,
                  record: step.record && { performedById: step.record.performedById, performedBy: step.record.performedBy.displayName, initials: initials(step.record.performedBy.displayName), signedOn: signedOn.format(step.record.performedAt), notApplicable: step.record.notApplicable, reading: step.record.reading, checkedItems: step.record.checkedItems, notApplicableItems: step.record.notApplicableItems, note: step.record.note },
                }))}
                viewerId={viewer.id}
                workOrderId={workOrder.id}
              />
            ) : isClosed ? (
              <p className="text-sm text-muted">This job was completed before checklists were tracked in the portal.</p>
            ) : (
              <ActionFeedbackForm action={startChecklist} className="flex flex-wrap items-center gap-3">
                <input name="workOrderId" type="hidden" value={workOrder.id} />
                <p className="text-sm text-muted">This job was opened before checklists were tracked in the portal.</p>
                <button className={buttonStyles({ variant: "outline", size: "sm" })}><ListChecks size={15} /> Start the checklist</button>
              </ActionFeedbackForm>
            )}
          </Section>
          <TimelineComposer customerHasPortalUsers={customerPortalUsers > 0} workOrderId={workOrder.id} />
          <Section icon={<History className="text-brand" size={20} />} title="Timeline">
            <TimelineList entries={timeline} workOrderId={workOrder.id} />
          </Section>
        </div>

        <aside className="grid content-start gap-6">
          <Section icon={<ClipboardCheck className="text-brand" size={20} />} title="Service state">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-l-4 border-brand bg-surface px-4 py-3">
              <div>
                <p className="text-xs font-bold tracking-[0.08em] text-muted">WITH</p>
                <p className="mt-0.5 font-bold">{isClosed ? "Nobody: this job is closed" : workOrder.assignedTo ? (isMine ? "You" : workOrder.assignedTo.displayName) : "Nobody yet: waiting in the queue"}</p>
                {!isClosed && <p className="mt-0.5 text-xs text-muted">{daysInStage === 0 ? "Entered this stage today" : `${daysInStage} day${daysInStage === 1 ? "" : "s"} in this stage`}</p>}
              </div>
              {!isClosed && !isMine && (
                <ActionFeedbackForm action={assignWorkOrder} className="flex flex-wrap items-center gap-2">
                  <input name="workOrderId" type="hidden" value={workOrder.id} />
                  <input name="assigneeId" type="hidden" value="me" />
                  <button className={buttonStyles({ variant: "secondary", size: "sm" })}><Hand size={15} /> Take it</button>
                </ActionFeedbackForm>
              )}
            </div>
            <ActionFeedbackForm action={updateWorkOrderStatus} className="grid gap-3" key={`${workOrder.serviceStageId}:${workOrder.condition}:${workOrder.assignedToId}`} successMessage="Service state updated.">
              <input name="workOrderId" type="hidden" value={workOrder.id} />
              <Field htmlFor="service-stage" label="Stage">
                <select className={fieldStyles} defaultValue={workOrder.serviceStageId} id="service-stage" name="serviceStageId">{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.displayName}</option>)}</select>
              </Field>
              <Field htmlFor="work-order-condition" label="Condition">
                <select className={fieldStyles} defaultValue={workOrder.condition} id="work-order-condition" name="condition">{Object.values(WorkOrderCondition).map((condition) => <option key={condition} value={condition}>{formatEnumLabel(condition)}</option>)}</select>
              </Field>
              <Field htmlFor="handoff" label="Hand to">
                <select className={fieldStyles} defaultValue="keep" id="handoff" name="handoff">
                  <option value="keep">{workOrder.assignedTo ? `Keep with ${isMine ? "me" : workOrder.assignedTo.displayName}` : "Leave in the queue"}</option>
                  {workOrder.assignedTo && <option value="">The queue (nobody in particular)</option>}
                  {staff.filter((person) => person.id !== workOrder.assignedToId).map((person) => <option key={person.id} value={person.id}>{person.id === viewer.id ? "Me" : person.displayName}</option>)}
                </select>
              </Field>
              <Field hint="Staff only. Say what was done and what's next." htmlFor="status-note" label="Handoff note" optional>
                <textarea className={fieldStyles} id="status-note" maxLength={1000} name="note" rows={2} />
              </Field>
              {isManager && checklist && (
                <Field hint="Only needed to move a job on while required checklist steps are unsigned. It's recorded." htmlFor="override-reason" label="Manager override reason" optional>
                  <input className={fieldStyles} id="override-reason" maxLength={500} name="overrideReason" />
                </Field>
              )}
              <button className={buttonStyles()}>Update state</button>
            </ActionFeedbackForm>
          </Section>

          <Section
            actions={<ShippingEditor canChangeLength={isManager || viewerApprovesWarranty} shippedAt={dateInput(workOrder.shippedAt)} standardNote={standardNote} today={dateInput(today)!} warrantyMonths={workOrder.warrantyMonths} workOrderId={workOrder.id} />}
            icon={<ShieldCheck className="text-brand" size={20} />}
            id="warranty"
            title="Shipping and warranty"
          >
            <Facts items={[
              ["Shipped", workOrder.shippedAt && dateOnly.format(workOrder.shippedAt)],
              ["Warranty", warrantyMonths === null ? null : warrantyMonths === 0 ? "None" : <>{warrantyLengthLabel(warrantyMonths)}{workOrder.warrantyMonths === null && <span className="font-normal text-muted"> ({standardWarranty.source === "contract" ? "customer's contract" : "model standard"})</span>}</>],
              ["Covered until", workOrder.warrantyEndsAt && <span className="flex flex-wrap items-center gap-2">{dateOnly.format(workOrder.warrantyEndsAt)}<Badge tone={ownWarranty === "active" ? "success" : "neutral"}>{ownWarranty === "active" ? "In warranty" : "Expired"}</Badge></span>],
            ]} />
            {!workOrder.shippedAt && <p className="mt-3 text-xs text-muted">The warranty starts on the ship date, which is recorded when the job moves to Shipped.</p>}
            {warrantyMonths === null && <p className="mt-3 text-xs text-muted">No standard warranty is set for this model or customer. Set one on the model&apos;s or customer&apos;s page, or enter a length here.</p>}
            {workOrder.warrantyClaims.length > 0 && (
              <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
                Claimed against by {workOrder.warrantyClaims.map((claim, index) => (
                  <span key={claim.id}>{index > 0 && ", "}<Link className="font-bold text-ink hover:text-brand" href={`/workspace/work-orders/${claim.id}`}>WIP {claim.workOrderNumber}</Link>{claim.warrantyDecision && ` (${formatEnumLabel(claim.warrantyDecision).toLowerCase()})`}</span>
                ))}
              </p>
            )}

            {(workOrder.warrantyClaimOn || (previousRepair && !isClosed)) && claimTarget && (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="text-sm font-bold">Warranty claim</h3>
                <p className="mt-1 text-sm text-muted">
                  {workOrder.warrantyClaimOn ? "Claimed against " : "Last repaired on "}
                  <Link className="font-bold text-ink hover:text-brand" href={`/workspace/work-orders/${claimTarget.id}`}>WIP {claimTarget.workOrderNumber}</Link>
                  {claimTarget.shippedAt && `, shipped ${dateOnly.format(claimTarget.shippedAt)}`}.
                  {claimTarget.warrantyEndsAt
                    ? ` Its warranty ${arrivedInWarranty ? "covers" : "ended on"} ${arrivedInWarranty ? `this pump until ${dateOnly.format(claimTarget.warrantyEndsAt)}` : `${dateOnly.format(claimTarget.warrantyEndsAt)}, before this pump came back`}.`
                    : " That repair has no warranty recorded."}
                </p>
                {workOrder.warrantyClaimOn && workOrder.warrantyDecision ? (
                  <div className="mt-3 grid gap-3">
                    <div>
                      <Badge tone={workOrder.warrantyDecision === "APPROVED" ? "success" : workOrder.warrantyDecision === "DENIED" ? "danger" : "brand"}>{claimDecisionLabels[workOrder.warrantyDecision]}</Badge>
                      {workOrder.warrantyDecidedBy && workOrder.warrantyDecidedAt && <p className="mt-2 text-xs text-muted">{workOrder.warrantyDecidedBy.displayName}, {dateTime.format(workOrder.warrantyDecidedAt)}</p>}
                      {workOrder.warrantyDecisionNote && <p className="mt-1 whitespace-pre-line text-sm">{workOrder.warrantyDecisionNote}</p>}
                    </div>
                    {!isClosed && <ClaimDecision canDecide={viewerApprovesWarranty} decision={workOrder.warrantyDecision} workOrderId={workOrder.id} />}
                    {workOrder.warrantyDecision === "PENDING" && !viewerApprovesWarranty && <p className="text-xs text-muted">A warranty approver decides this. They&apos;ve been emailed.</p>}
                  </div>
                ) : (
                  <div className="mt-3"><OpenClaimButton previousNumber={claimTarget.workOrderNumber} workOrderId={workOrder.id} /></div>
                )}
              </div>
            )}
          </Section>

          <Section icon={<Info className="text-brand" size={20} />} title="Details">
            <Facts items={[
              ["Service center", workOrder.serviceCenter ? `${workOrder.serviceCenter.code} · ${workOrder.serviceCenter.name}` : null],
              ["Received", workOrder.receivedAt ? dateTime.format(workOrder.receivedAt) : null],
              ["Promised", workOrder.promisedAt ? dateOnly.format(workOrder.promisedAt) : null],
              ["Customer PO", workOrder.customerPurchaseOrder],
              ["RMA", workOrder.rmaReference],
              ["Opened by", workOrder.createdBy.displayName],
            ]} />
          </Section>

          <Section
            actions={<PartsEditor parts={{ workOrderId: workOrder.id, partsRequired: workOrder.partsRequired, partsKit: workOrder.partsKit, extraLaborHours: workOrder.extraLaborHours?.toString() ?? null, quotedAt: dateInput(workOrder.quotedAt), partsOrderedAt: dateInput(workOrder.partsOrderedAt), partsReceivedAt: dateInput(workOrder.partsReceivedAt), partsReceivedById: workOrder.partsReceivedById }} staff={staff} viewerId={viewer.id} />}
            icon={<PackageSearch className="text-brand" size={20} />}
            title="Parts and quote"
          >
            <Facts items={[
              ["Parts required", workOrder.partsRequired && <span className="whitespace-pre-line">{workOrder.partsRequired}</span>],
              ["Kit", workOrder.partsKit && partsKitLabels[workOrder.partsKit]],
              ["Extra labor", workOrder.extraLaborHours && `${workOrder.extraLaborHours.toString()} hours`],
              ["Customer quoted", workOrder.quotedAt && dateOnly.format(workOrder.quotedAt)],
              ["Parts ordered", workOrder.partsOrderedAt && dateOnly.format(workOrder.partsOrderedAt)],
              ["Parts received", workOrder.partsReceivedAt && `${dateOnly.format(workOrder.partsReceivedAt)}${workOrder.partsReceivedBy ? `, inspected by ${workOrder.partsReceivedBy.displayName}` : ""}`],
            ]} />
          </Section>

          <Section icon={<ClipboardCheck className="text-brand" size={20} />} title="Intake">
            <Facts items={[
              ["Tool ID", workOrder.toolId],
              ["Oil", [workOrder.oilType, workOrder.oilWeight].filter(Boolean).join(" · ") || null],
              ["Copper class", workOrder.copperClassification === "UNKNOWN" ? null : copperClassificationLabels[workOrder.copperClassification]],
              ["Contaminants", workOrder.contaminants],
              ["Reason", workOrder.reasonForService],
              ["Accessories", workOrder.accessoriesReceived],
            ]} />
          </Section>

          <Section icon={<UserRound className="text-brand" size={20} />} title="Customer contact">
            {workOrder.customerContactName || workOrder.customerContactEmail || workOrder.customerContactPhone ? (
              <div className="grid gap-1 text-sm">
                {workOrder.customerContactName && <p className="font-bold">{workOrder.customerContactName}</p>}
                {workOrder.customerContactPhone && <p>{workOrder.customerContactPhone}</p>}
                {workOrder.customerContactEmail && <p className="break-all">{workOrder.customerContactEmail}</p>}
              </div>
            ) : <p className="text-sm text-muted">No contact recorded for this repair.</p>}
            <p className="mt-3 text-xs text-muted">{customerPortalUsers ? `${customerPortalUsers} customer portal user${customerPortalUsers === 1 ? "" : "s"} can follow this repair.` : "No one at this customer has portal access yet."}</p>
          </Section>
        </aside>
      </div>

      <Section className="mt-6" icon={<Camera className="text-brand" size={20} />} id="photos" title={`Photos (${photos.length})`}>
        <PhotoGallery initialPhotoId={initialPhotoId} photos={photos} workOrderId={workOrder.id} />
      </Section>

      <Section className="mt-6" icon={<FileText className="text-brand" size={20} />} title={`Documents (${documents.length})`}>
        <ActionFeedbackForm action={createInternalDocument} className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" feedbackClassName="sm:col-span-4" resetOnSuccess successMessage="Document uploaded.">
          <input name="workOrderId" type="hidden" value={workOrder.id} />
          <Field htmlFor="document-file" label="Document"><input className={fieldStyles} id="document-file" name="file" required type="file" /></Field>
          <Field htmlFor="document-type" label="Type">
            <select className={fieldStyles} defaultValue="OTHER" id="document-type" name="documentType">{Object.entries(documentTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </Field>
          <Field htmlFor="document-visibility" label="Who can see it">
            <select className={fieldStyles} defaultValue="INTERNAL_ONLY" id="document-visibility" name="visibility"><option value="INTERNAL_ONLY">Staff only</option><option value="CUSTOMER_VISIBLE">Customer and staff</option></select>
          </Field>
          <button className={buttonStyles({ variant: "secondary" })}><FileText size={16} /> Upload</button>
        </ActionFeedbackForm>
        {documents.length ? (
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {documents.map((document) => (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={document.id}>
                <div className="min-w-0">
                  <a className="break-words font-bold hover:text-brand" href={`/api/internal/attachments/${document.id}`}>{document.fileName}</a>
                  <p className="mt-0.5 text-xs text-muted">{document.documentType ? documentTypeLabels[document.documentType] : "Other"} · {Math.ceil(document.sizeBytes / 1024)} KB · {document.uploadedBy.displayName}, {dateTime.format(document.uploadedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={document.visibility === "CUSTOMER_VISIBLE" ? "brand" : "neutral"}>{document.visibility === "CUSTOMER_VISIBLE" ? "Customer can see" : "Staff only"}</Badge>
                  {isManager && (
                    <>
                      <ActionFeedbackForm action={updateDocumentVisibility} successMessage="Visibility updated.">
                        <input name="attachmentId" type="hidden" value={document.id} />
                        <input name="visibility" type="hidden" value={document.visibility === "CUSTOMER_VISIBLE" ? "INTERNAL_ONLY" : "CUSTOMER_VISIBLE"} />
                        <button className="text-xs font-bold text-brand">{document.visibility === "CUSTOMER_VISIBLE" ? "Make staff only" : "Share with customer"}</button>
                      </ActionFeedbackForm>
                      <ActionFeedbackForm action={deleteDocument} successMessage="Document deleted.">
                        <input name="attachmentId" type="hidden" value={document.id} />
                        <button className="text-xs font-bold text-danger">Delete</button>
                      </ActionFeedbackForm>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mt-5 text-sm text-muted">No documents yet. Upload POs, quotes, invoices and reports for this job here.</p>}
      </Section>

      <Section
        actions={workOrder.equipment.productModelId && <Link className="text-sm font-bold text-brand" href={`/workspace/models/${workOrder.equipment.productModelId}`}>{isManager ? "Manage this model's documents" : "Open model"}</Link>}
        className="mt-6"
        icon={<BookOpen className="text-brand" size={20} />}
        title={`Manuals for ${workOrder.equipment.productModel}`}
      >
        {manuals.length
          ? <ModelDocumentList documents={manuals} downloadPath="/api/internal/model-documents" showVisibility />
          : <p className="text-sm text-muted">{workOrder.equipment.productModelId ? "No manuals have been added for this model yet." : "This pump isn't linked to a catalog model yet. Edit the pump to link it and see its manuals here."}</p>}
      </Section>
    </main>
  );
}
