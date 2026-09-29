import Link from "next/link";
import { CustomerFacingStatus, WorkOrderCondition } from "@prisma/client";
import { ArrowUpRight, ClipboardList, Plus, SlidersHorizontal } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser } from "@/services/authorization";
import { formatEnumLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await getActiveInternalUser();
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const status = firstParam(params.status);
  const stageId = firstParam(params.stage);
  const condition = firstParam(params.condition);
  const customerStatus = Object.values(CustomerFacingStatus).includes(status as CustomerFacingStatus)
    ? status as CustomerFacingStatus
    : undefined;
  const workOrderCondition = Object.values(WorkOrderCondition).includes(condition as WorkOrderCondition)
    ? condition as WorkOrderCondition
    : undefined;

  const [workOrders, serviceStages] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        ...(customerStatus ? { customerFacingStatus: customerStatus } : {}),
        ...(stageId ? { serviceStageId: stageId } : {}),
        ...(workOrderCondition ? { condition: workOrderCondition } : {}),
        ...(search ? {
          OR: [
            { workOrderNumber: { contains: search, mode: "insensitive" } },
            { summary: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
            { equipment: { productModel: { contains: search, mode: "insensitive" } } },
            { equipment: { serialNumber: { contains: search, mode: "insensitive" } } },
          ],
        } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        workOrderNumber: true,
        summary: true,
        condition: true,
        customerFacingStatus: true,
        updatedAt: true,
        company: { select: { name: true } },
        equipment: { select: { id: true, productModel: true, serialNumber: true } },
        serviceStage: { select: { displayName: true } },
      },
    }),
    prisma.serviceStage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" }, select: { id: true, displayName: true } }),
  ]);

  const filtersApplied = Boolean(search || customerStatus || stageId || workOrderCondition);

  return (
    <main className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-7">
          <div>
            <p className="text-sm font-bold tracking-[0.1em] text-brand">OPERATIONS</p>
            <h1 className="mt-2 text-3xl font-bold">Work orders</h1>
            <p className="mt-2 text-muted">Find a repair, review its current service state, and open the complete work record.</p>
          </div>
          <div className="flex items-center gap-4"><p className="text-sm font-bold text-muted">{workOrders.length} result{workOrders.length === 1 ? "" : "s"}</p><Link className="flex items-center gap-2 bg-brand px-3 py-2.5 text-sm font-bold text-white" href="/workspace/work-orders/new"><Plus size={16} /> New work order</Link></div>
        </div>

        <section aria-label="Work-order filters" className="mt-6 border border-line bg-paper p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-body"><SlidersHorizontal size={17} className="text-brand" /> Filter queue</div>
          <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="sr-only" htmlFor="work-order-search">Search work orders</label>
            <input className="border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" defaultValue={search} id="work-order-search" name="search" placeholder="Number, customer, model, serial" />
            <label className="sr-only" htmlFor="customer-status">Customer status</label>
            <select className="border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" defaultValue={customerStatus ?? ""} id="customer-status" name="status"><option value="">All customer statuses</option>{Object.values(CustomerFacingStatus).map((item) => <option key={item} value={item}>{formatEnumLabel(item)}</option>)}</select>
            <label className="sr-only" htmlFor="service-stage">Service stage</label>
            <select className="border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" defaultValue={stageId ?? ""} id="service-stage" name="stage"><option value="">All service stages</option>{serviceStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.displayName}</option>)}</select>
            <label className="sr-only" htmlFor="work-order-condition">Condition</label>
            <select className="border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" defaultValue={workOrderCondition ?? ""} id="work-order-condition" name="condition"><option value="">All conditions</option>{Object.values(WorkOrderCondition).map((item) => <option key={item} value={item}>{formatEnumLabel(item)}</option>)}</select>
            <div className="flex gap-2"><button className="flex-1 bg-brand px-3 py-2.5 text-sm font-bold text-white">Apply filters</button>{filtersApplied && <Link className="border border-brand px-3 py-2.5 text-sm font-bold text-brand" href="/workspace/work-orders">Reset</Link>}</div>
          </form>
        </section>

        <section className="mt-6 border-y border-line bg-paper">
          {workOrders.length ? workOrders.map((workOrder) => <Link className="group grid gap-4 border-b border-line px-5 py-5 last:border-b-0 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto]" href={`/workspace/work-orders/${workOrder.id}`} key={workOrder.id}>
            <div>
              <p className="text-sm font-bold text-brand">{workOrder.workOrderNumber}</p>
              <h2 className="mt-1 text-lg font-bold group-hover:text-brand">{workOrder.summary}</h2>
              <p className="mt-2 text-sm text-muted">{workOrder.company.name} · {workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}</p>
            </div>
            <div className="flex items-start gap-3 sm:text-right"><div><p className="font-bold">{workOrder.serviceStage.displayName}</p><p className="mt-1 text-sm text-muted">{formatEnumLabel(workOrder.condition)} · {formatEnumLabel(workOrder.customerFacingStatus)}</p></div><ArrowUpRight className="mt-1 text-brand" size={18} /></div>
          </Link>) : <div className="px-5 py-14 text-center"><ClipboardList className="mx-auto mb-3 text-muted" size={24} /><p className="font-bold">{filtersApplied ? "No work orders match these filters." : "No work orders yet."}</p><p className="mt-1 text-sm text-muted">{filtersApplied ? "Change or clear the filters to broaden the queue." : "New repair records will appear here."}</p></div>}
        </section>
      </div>
    </main>
  );
}