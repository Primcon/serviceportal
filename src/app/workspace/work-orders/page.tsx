import Link from "next/link";
import { CustomerFacingStatus, ListKind, UserRole, WorkOrderCondition } from "@prisma/client";
import { Bookmark, ClipboardList, Download, Plus, SlidersHorizontal, X } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { WorkOrderRows } from "@/features/work-orders/components/work-order-rows";
import { deleteWorkOrderFilter, saveWorkOrderFilter } from "@/features/work-orders/list-actions";
import { readWorkOrderFilters } from "@/features/work-orders/list-filters";
import { listOptions, serviceCenters } from "@/features/settings/queries";
import { customerStatusLabels, formatEnumLabel, isElevatedPriority } from "@/lib/labels";
import { pageFromParams, pageWindow, type SearchParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { assignableStaff } from "@/features/assignments/assign";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

const pageSize = 25;

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireWorkspaceUser();
  const params = await searchParams;
  const { search, status, condition, stageId, centerId, priority, companyId, assignee, openOnly, overdueOnly, where, filtersApplied, query } = readWorkOrderFilters(params, viewer.id);
  const page = pageFromParams(params);

  const [total, workOrders, stages, centers, priorities, company, staff, savedFilters] = await Promise.all([
    prisma.workOrder.count({ where }),
    prisma.workOrder.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      ...pageWindow(page, pageSize),
      select: {
        id: true,
        workOrderNumber: true,
        summary: true,
        condition: true,
        priority: true,
        customerFacingStatus: true,
        promisedAt: true,
        company: { select: { name: true } },
        equipment: { select: { productModel: true, serialNumber: true } },
        serviceStage: { select: { displayName: true } },
        assignedTo: { select: { id: true, displayName: true } },
      },
    }),
    prisma.serviceStage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" }, select: { id: true, displayName: true } }),
    serviceCenters(),
    listOptions(ListKind.PRIORITY),
    companyId ? prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }) : null,
    assignableStaff(),
    prisma.savedFilter.findMany({ where: { userId: viewer.id }, orderBy: { name: "asc" }, select: { id: true, name: true, query: true } }),
  ]);
  const isManager = viewer.internalRole === UserRole.PORTAL_ADMINISTRATOR || viewer.internalRole === UserRole.VACTECH_MANAGER;
  // Promised dates are calendar dates stored as midnight UTC.
  const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <PageHeader
        actions={(
          <>
            {total > 0 && <a className={buttonStyles({ variant: "outline" })} href={`/workspace/work-orders/export${query ? `?${query}` : ""}`}><Download size={16} /> Download (.xlsx)</a>}
            <Link className={buttonStyles()} href="/workspace/work-orders/new"><Plus size={16} /> New work order</Link>
          </>
        )}
        description="Find a repair, review its current service state, and open the complete work record."
        eyebrow="OPERATIONS"
        title="Work orders"
      />

      <section aria-label="Work-order filters" className="mt-6 border border-line bg-paper p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-body"><SlidersHorizontal className="text-brand" size={17} /> Filter queue</div>
        {savedFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Saved:</span>
            {savedFilters.map((saved) => (
              <span className={`flex items-center border ${saved.query === query ? "border-ink bg-ink text-white" : "border-line"}`} key={saved.id}>
                <Link className="px-2.5 py-1 font-bold" href={`/workspace/work-orders?${saved.query}`}>{saved.name}</Link>
                <ActionFeedbackForm action={deleteWorkOrderFilter} className="contents" successMessage="Removed.">
                  <input name="filterId" type="hidden" value={saved.id} />
                  <button aria-label={`Remove saved filter ${saved.name}`} className="border-l border-current/20 px-1.5 py-1 opacity-60 hover:opacity-100"><X size={13} /></button>
                </ActionFeedbackForm>
              </span>
            ))}
          </div>
        )}
        {company && <p className="mt-3 text-sm">Showing work orders for <span className="font-bold">{company.name}</span>. <Link className="font-bold text-brand" href="/workspace/work-orders">Show all customers</Link></p>}
        <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" method="get">
          {companyId && <input name="company" type="hidden" value={companyId} />}
          <label className="sr-only" htmlFor="work-order-search">Search work orders</label>
          <input className={`${fieldStyles} xl:col-span-2`} defaultValue={search} id="work-order-search" name="search" placeholder="WIP, serial, PO, customer..." />
          <label className="sr-only" htmlFor="customer-status">Customer status</label>
          <select className={fieldStyles} defaultValue={status ?? ""} id="customer-status" name="status"><option value="">All statuses</option>{Object.values(CustomerFacingStatus).map((item) => <option key={item} value={item}>{customerStatusLabels[item]}</option>)}</select>
          <label className="sr-only" htmlFor="service-stage">Service stage</label>
          <select className={fieldStyles} defaultValue={stageId} id="service-stage" name="stage"><option value="">All stages</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.displayName}</option>)}</select>
          <label className="sr-only" htmlFor="work-order-condition">Condition</label>
          <select className={fieldStyles} defaultValue={condition ?? ""} id="work-order-condition" name="condition"><option value="">All conditions</option>{Object.values(WorkOrderCondition).map((item) => <option key={item} value={item}>{formatEnumLabel(item)}</option>)}</select>
          {centers.length > 1 && (
            <>
              <label className="sr-only" htmlFor="service-center">Service center</label>
              <select className={fieldStyles} defaultValue={centerId} id="service-center" name="center"><option value="">All centers</option>{centers.map((center) => <option key={center.id} value={center.id}>{center.code} · {center.name}</option>)}</select>
            </>
          )}
          <label className="sr-only" htmlFor="work-order-priority">Priority</label>
          <select className={fieldStyles} defaultValue={priority} id="work-order-priority" name="priority"><option value="">All priorities</option>{priorities.map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}</select>
          <label className="sr-only" htmlFor="work-order-assignee">Who has it</label>
          <select className={fieldStyles} defaultValue={assignee} id="work-order-assignee" name="assignee">
            <option value="">Anyone</option>
            <option value="me">With me</option>
            <option value="none">In the queue (nobody)</option>
            {staff.filter((person) => person.id !== viewer.id).map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-4 xl:col-span-7">
            <label className="flex items-center gap-2 text-sm text-muted"><input className="size-4 accent-brand" defaultChecked={openOnly} name="open" type="checkbox" value="1" /> Open jobs only</label>
            <label className="flex items-center gap-2 text-sm text-muted"><input className="size-4 accent-brand" defaultChecked={overdueOnly} name="overdue" type="checkbox" value="1" /> Past the promised date</label>
            <button className={buttonStyles({ size: "sm" })}>Apply filters</button>
            {filtersApplied && <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/workspace/work-orders">Reset</Link>}
            <p className="ml-auto self-center text-sm font-bold text-muted">{total} work order{total === 1 ? "" : "s"}</p>
          </div>
        </form>
        {filtersApplied && !savedFilters.some((saved) => saved.query === query) && (
          <ActionFeedbackForm action={saveWorkOrderFilter} className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4" feedbackClassName="w-full" resetOnSuccess>
            <input name="query" type="hidden" value={query} />
            <label className="sr-only" htmlFor="saved-filter-name">Name for this filter</label>
            <input className={`${fieldStyles} max-w-64`} id="saved-filter-name" maxLength={60} name="name" placeholder="Name, such as Rush jobs at AZ" required />
            <button className={buttonStyles({ variant: "outline", size: "sm" })}><Bookmark size={15} /> Save this filter</button>
          </ActionFeedbackForm>
        )}
      </section>

      <section className="mt-6 border-y border-line bg-paper">
        {workOrders.length ? (
          <WorkOrderRows
            isManager={isManager}
            rows={workOrders.map((workOrder) => ({
              id: workOrder.id,
              number: workOrder.workOrderNumber,
              summary: workOrder.summary,
              detail: `${workOrder.company.name} · ${workOrder.equipment.productModel} · Serial ${workOrder.equipment.serialNumber}`,
              priority: isElevatedPriority(workOrder.priority) ? workOrder.priority : null,
              condition: workOrder.condition === "NORMAL" ? null : formatEnumLabel(workOrder.condition),
              stage: workOrder.serviceStage.displayName,
              status: `${customerStatusLabels[workOrder.customerFacingStatus]}${workOrder.promisedAt ? ` · Promised ${dateFormat.format(workOrder.promisedAt)}` : ""}`,
              with: workOrder.assignedTo ? `With ${workOrder.assignedTo.id === viewer.id ? "you" : workOrder.assignedTo.displayName}` : null,
            }))}
            staff={staff.map((person) => ({ id: person.id, name: person.displayName }))}
            stages={stages.map((stage) => ({ id: stage.id, name: stage.displayName }))}
            viewerId={viewer.id}
          />
        ) : (
          <div className="p-5">
            <EmptyState
              description={filtersApplied ? "Change or clear the filters to broaden the queue." : "New repair records will appear here."}
              icon={<ClipboardList size={24} />}
              title={filtersApplied ? "No work orders match these filters." : "No work orders yet."}
            />
          </div>
        )}
        <Pagination label="work orders" page={page} pageSize={pageSize} params={params} pathname="/workspace/work-orders" total={total} />
      </section>
    </main>
  );
}
