import Link from "next/link";
import { CustomerFacingStatus, ListKind, Prisma, WorkOrderCondition } from "@prisma/client";
import { ArrowUpRight, ClipboardList, Plus, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { workOrderSearchWhere } from "@/features/search/queries";
import { listOptions, serviceCenters } from "@/features/settings/queries";
import { customerStatusLabels, formatEnumLabel } from "@/lib/labels";
import { firstParam, pageFromParams, pageWindow, type SearchParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

const pageSize = 25;

function oneOf<T extends string>(values: T[], value: string | undefined) {
  return values.includes(value as T) ? value as T : undefined;
}

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser();
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const status = oneOf(Object.values(CustomerFacingStatus), firstParam(params.status));
  const condition = oneOf(Object.values(WorkOrderCondition), firstParam(params.condition));
  const stageId = firstParam(params.stage) ?? "";
  const centerId = firstParam(params.center) ?? "";
  const priority = firstParam(params.priority) ?? "";
  const page = pageFromParams(params);

  const where: Prisma.WorkOrderWhereInput = {
    ...(status ? { customerFacingStatus: status } : {}),
    ...(condition ? { condition } : {}),
    ...(stageId ? { serviceStageId: stageId } : {}),
    ...(centerId ? { serviceCenterId: centerId } : {}),
    ...(priority ? { priority } : {}),
    ...(search ? workOrderSearchWhere(search) : {}),
  };

  const [total, workOrders, stages, centers, priorities] = await Promise.all([
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
      },
    }),
    prisma.serviceStage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" }, select: { id: true, displayName: true } }),
    serviceCenters(),
    listOptions(ListKind.PRIORITY),
  ]);
  const filtersApplied = Boolean(search || status || condition || stageId || centerId || priority);
  const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <PageHeader
        actions={<Link className={buttonStyles()} href="/workspace/work-orders/new"><Plus size={16} /> New work order</Link>}
        description="Find a repair, review its current service state, and open the complete work record."
        eyebrow="OPERATIONS"
        title="Work orders"
      />

      <section aria-label="Work-order filters" className="mt-6 border border-line bg-paper p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-body"><SlidersHorizontal className="text-brand" size={17} /> Filter queue</div>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" method="get">
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
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-7">
            <button className={buttonStyles({ size: "sm" })}>Apply filters</button>
            {filtersApplied && <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/workspace/work-orders">Reset</Link>}
            <p className="ml-auto self-center text-sm font-bold text-muted">{total} work order{total === 1 ? "" : "s"}</p>
          </div>
        </form>
      </section>

      <section className="mt-6 border-y border-line bg-paper">
        {workOrders.length ? workOrders.map((workOrder) => (
          <Link className="group grid gap-4 border-b border-line px-5 py-5 last:border-b-0 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto]" href={`/workspace/work-orders/${workOrder.id}`} key={workOrder.id}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-brand">{workOrder.workOrderNumber}</p>
                {workOrder.priority && workOrder.priority !== "Standard" && <Badge tone="danger">{workOrder.priority}</Badge>}
                {workOrder.condition !== "NORMAL" && <Badge tone="outline">{formatEnumLabel(workOrder.condition)}</Badge>}
              </div>
              <h2 className="mt-1 text-lg font-bold group-hover:text-brand">{workOrder.summary}</h2>
              <p className="mt-2 text-sm text-muted">{workOrder.company.name} · {workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}</p>
            </div>
            <div className="flex items-start gap-3 sm:text-right">
              <div>
                <p className="font-bold">{workOrder.serviceStage.displayName}</p>
                <p className="mt-1 text-sm text-muted">{customerStatusLabels[workOrder.customerFacingStatus]}{workOrder.promisedAt && ` · Promised ${dateFormat.format(workOrder.promisedAt)}`}</p>
              </div>
              <ArrowUpRight className="mt-1 text-brand" size={18} />
            </div>
          </Link>
        )) : (
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
