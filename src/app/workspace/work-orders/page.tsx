import Link from "next/link";
import { CustomerFacingStatus, WorkOrderCondition } from "@prisma/client";
import { ArrowUpRight, ClipboardList, Plus, SlidersHorizontal } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser } from "@/services/authorization";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
    <main className="min-h-screen bg-[#f6f6f6] text-[#000000]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d9d9d9] pb-7">
          <div>
            <p className="text-sm font-bold tracking-[0.1em] text-[#ea3435]">OPERATIONS</p>
            <h1 className="mt-2 text-3xl font-bold">Work orders</h1>
            <p className="mt-2 text-[#5a5a5a]">Find a repair, review its current service state, and open the complete work record.</p>
          </div>
          <div className="flex items-center gap-4"><p className="text-sm font-bold text-[#5a5a5a]">{workOrders.length} result{workOrders.length === 1 ? "" : "s"}</p><Link className="flex items-center gap-2 bg-[#ea3435] px-3 py-2.5 text-sm font-bold text-white" href="/workspace/work-orders/new"><Plus size={16} /> New work order</Link></div>
        </div>

        <section aria-label="Work-order filters" className="mt-6 border border-[#d9d9d9] bg-[#ffffff] p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#333333]"><SlidersHorizontal size={17} className="text-[#ea3435]" /> Filter queue</div>
          <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="sr-only" htmlFor="work-order-search">Search work orders</label>
            <input className="border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ea3435]" defaultValue={search} id="work-order-search" name="search" placeholder="Number, customer, model, serial" />
            <label className="sr-only" htmlFor="customer-status">Customer status</label>
            <select className="border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ea3435]" defaultValue={customerStatus ?? ""} id="customer-status" name="status"><option value="">All customer statuses</option>{Object.values(CustomerFacingStatus).map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}</select>
            <label className="sr-only" htmlFor="service-stage">Service stage</label>
            <select className="border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ea3435]" defaultValue={stageId ?? ""} id="service-stage" name="stage"><option value="">All service stages</option>{serviceStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.displayName}</option>)}</select>
            <label className="sr-only" htmlFor="work-order-condition">Condition</label>
            <select className="border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ea3435]" defaultValue={workOrderCondition ?? ""} id="work-order-condition" name="condition"><option value="">All conditions</option>{Object.values(WorkOrderCondition).map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}</select>
            <div className="flex gap-2"><button className="flex-1 bg-[#ea3435] px-3 py-2.5 text-sm font-bold text-white">Apply filters</button>{filtersApplied && <Link className="border border-[#ea3435] px-3 py-2.5 text-sm font-bold text-[#ea3435]" href="/workspace/work-orders">Reset</Link>}</div>
          </form>
        </section>

        <section className="mt-6 border-y border-[#d9d9d9] bg-[#ffffff]">
          {workOrders.length ? workOrders.map((workOrder) => <Link className="group grid gap-4 border-b border-[#d9d9d9] px-5 py-5 last:border-b-0 hover:bg-[#f6f6f6] sm:grid-cols-[minmax(0,1fr)_auto]" href={`/workspace/work-orders/${workOrder.id}`} key={workOrder.id}>
            <div>
              <p className="text-sm font-bold text-[#ea3435]">{workOrder.workOrderNumber}</p>
              <h2 className="mt-1 text-lg font-bold group-hover:text-[#ea3435]">{workOrder.summary}</h2>
              <p className="mt-2 text-sm text-[#5a5a5a]">{workOrder.company.name} · {workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}</p>
            </div>
            <div className="flex items-start gap-3 sm:text-right"><div><p className="font-bold">{workOrder.serviceStage.displayName}</p><p className="mt-1 text-sm text-[#5a5a5a]">{formatLabel(workOrder.condition)} · {formatLabel(workOrder.customerFacingStatus)}</p></div><ArrowUpRight className="mt-1 text-[#ea3435]" size={18} /></div>
          </Link>) : <div className="px-5 py-14 text-center"><ClipboardList className="mx-auto mb-3 text-[#5a5a5a]" size={24} /><p className="font-bold">{filtersApplied ? "No work orders match these filters." : "No work orders yet."}</p><p className="mt-1 text-sm text-[#5a5a5a]">{filtersApplied ? "Change or clear the filters to broaden the queue." : "New repair records will appear here."}</p></div>}
        </section>
      </div>
    </main>
  );
}