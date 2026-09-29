import Link from "next/link";
import { ArrowLeft, ClipboardList, Package } from "lucide-react";
import { notFound } from "next/navigation";
import { getCustomerEquipment } from "@/features/work-orders/customer-queries";
import { getRequestActor } from "@/services/request-actor";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default async function CustomerEquipmentPage({ params }: { params: Promise<{ equipmentId: string }> }) {
  const { equipmentId } = await params;
  let equipment;
  try {
    const actor = await getRequestActor("customer");
    equipment = actor ? await getCustomerEquipment(actor.identitySubject, equipmentId) : null;
  } catch {
    notFound();
  }
  if (!equipment) notFound();

  return (
    <main className="min-h-screen bg-[#ffffff] px-5 py-6 text-[#000000] sm:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/portal/equipment" className="flex w-fit items-center gap-2 text-sm font-bold text-[#ea3435]"><ArrowLeft size={16} /> Equipment</Link>
        <section className="border-b border-[#d9d9d9] py-9">
          <div className="flex items-center gap-2 text-sm font-bold tracking-[0.1em] text-[#ea3435]"><Package size={17} /> EQUIPMENT HISTORY</div>
          <h1 className="mt-3 text-4xl font-bold">{equipment.productModel}</h1>
          <p className="mt-3 text-[#5a5a5a]">Serial {equipment.serialNumber} · {equipment.company.name}</p>
          {equipment.description && <p className="mt-3 max-w-2xl leading-7 text-[#333333]">{equipment.description}</p>}
        </section>
        <section className="mt-8 border-y border-[#d9d9d9]">
          <div className="flex items-center justify-between gap-3 border-b border-[#d9d9d9] py-4"><div className="flex items-center gap-2 font-bold"><ClipboardList size={18} className="text-[#ea3435]" /> Service history</div><p className="text-sm text-[#5a5a5a]">{equipment.workOrders.length} record{equipment.workOrders.length === 1 ? "" : "s"}</p></div>
          {equipment.workOrders.length ? <div className="divide-y divide-[#d9d9d9]">{equipment.workOrders.map((workOrder) => <Link className="block py-5 hover:text-[#ea3435]" href={`/portal/work-orders/${workOrder.id}`} key={workOrder.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{workOrder.workOrderNumber} · {workOrder.summary}</p><p className="mt-2 text-sm text-[#5a5a5a]">{workOrder.serviceStage.displayName}</p></div><div className="text-right"><span className="bg-[#fde5e5] px-2 py-1 text-xs font-bold text-[#ea3435]">{workOrder.customerFacingStatus.replace("_", " ")}</span><time className="mt-2 block text-xs text-[#5a5a5a]">Updated {formatDate(workOrder.updatedAt)}</time></div></div></Link>)}</div> : <p className="py-8 text-sm text-[#5a5a5a]">No service history is available for this equipment yet.</p>}
        </section>
      </div>
    </main>
  );
}
