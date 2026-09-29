import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Package } from "lucide-react";
import { notFound } from "next/navigation";
import { getInternalEquipment } from "@/features/work-orders/internal-queries";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default async function InternalEquipmentPage({ params }: { params: Promise<{ equipmentId: string }> }) {
  const { equipmentId } = await params;
  const equipment = await getInternalEquipment(equipmentId);
  if (!equipment) notFound();

  return (
    <main className="min-h-screen bg-[#f6f6f6] text-[#000000]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <Link href="/workspace/equipment" className="flex w-fit items-center gap-2 text-sm font-bold text-[#ea3435]"><ArrowLeft size={16} /> Equipment</Link>
        <section className="border-b border-[#d9d9d9] pb-7">
          <div className="flex items-center gap-2 text-sm font-bold tracking-[0.1em] text-[#ea3435]"><Package size={17} /> EQUIPMENT HISTORY</div>
          <h1 className="mt-3 text-3xl font-bold">{equipment.productModel}</h1>
          <p className="mt-2 text-[#5a5a5a]">Serial {equipment.serialNumber} · {equipment.company.name}</p>
          {equipment.description && <p className="mt-3 max-w-2xl leading-7 text-[#333333]">{equipment.description}</p>}
        </section>
        <section className="mt-8 border border-[#d9d9d9] bg-[#ffffff]">
          <div className="flex items-center justify-between gap-3 border-b border-[#d9d9d9] px-5 py-4"><div className="flex items-center gap-2 font-bold"><ClipboardCheck size={18} className="text-[#ea3435]" /> Work-order history</div><p className="text-sm text-[#5a5a5a]">{equipment.workOrders.length} record{equipment.workOrders.length === 1 ? "" : "s"}</p></div>
          {equipment.workOrders.length ? <div className="divide-y divide-[#d9d9d9]">{equipment.workOrders.map((workOrder) => <Link className="block px-5 py-4 hover:bg-[#f6f6f6]" href={`/workspace/work-orders/${workOrder.id}`} key={workOrder.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{workOrder.workOrderNumber} · {workOrder.summary}</p><p className="mt-1 text-sm text-[#5a5a5a]">{workOrder.serviceStage.displayName} · {workOrder.condition.replaceAll("_", " ")}</p></div><time className="text-xs text-[#5a5a5a]">Updated {formatDate(workOrder.updatedAt)}</time></div></Link>)}</div> : <p className="px-5 py-8 text-sm text-[#5a5a5a]">No work orders have been created for this equipment.</p>}
        </section>
      </div>
    </main>
  );
}
