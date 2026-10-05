import Link from "next/link";
import { ArrowLeft, BookOpen, ClipboardList, Package } from "lucide-react";
import { notFound } from "next/navigation";
import { ModelDocumentList } from "@/features/catalog/components/model-document-list";
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
  const manuals = equipment.catalogModel?.documents ?? [];

  return (
    <main className="min-h-screen bg-paper px-5 py-6 text-ink sm:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/portal/equipment" className="flex w-fit items-center gap-2 text-sm font-bold text-brand"><ArrowLeft size={16} /> Equipment</Link>
        <section className="border-b border-line py-9">
          <div className="flex items-center gap-2 text-sm font-bold tracking-[0.1em] text-brand"><Package size={17} /> EQUIPMENT HISTORY</div>
          <h1 className="mt-3 text-4xl font-bold">{equipment.productModel}</h1>
          <p className="mt-3 text-muted">Serial {equipment.serialNumber} · {equipment.company.name}</p>
          {equipment.description && <p className="mt-3 max-w-2xl leading-7 text-body">{equipment.description}</p>}
        </section>
        <section className="mt-8 border-y border-line">
          <div className="flex items-center justify-between gap-3 border-b border-line py-4"><div className="flex items-center gap-2 font-bold"><ClipboardList size={18} className="text-brand" /> Service history</div><p className="text-sm text-muted">{equipment.workOrders.length} record{equipment.workOrders.length === 1 ? "" : "s"}</p></div>
          {equipment.workOrders.length ? <div className="divide-y divide-line">{equipment.workOrders.map((workOrder) => <Link className="block py-5 hover:text-brand" href={`/portal/work-orders/${workOrder.id}`} key={workOrder.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{workOrder.workOrderNumber} · {workOrder.summary}</p><p className="mt-2 text-sm text-muted">{workOrder.serviceStage.displayName}</p></div><div className="text-right"><span className="bg-brand-soft px-2 py-1 text-xs font-bold text-brand">{workOrder.customerFacingStatus.replace("_", " ")}</span><time className="mt-2 block text-xs text-muted">Updated {formatDate(workOrder.updatedAt)}</time></div></div></Link>)}</div> : <p className="py-8 text-sm text-muted">No service history is available for this equipment yet.</p>}
        </section>
        {manuals.length > 0 && (
          <section className="mt-8 border border-line p-6">
            <h2 className="flex items-center gap-2 font-bold"><BookOpen className="text-brand" size={18} /> Manuals and documents</h2>
            <div className="mt-2"><ModelDocumentList documents={manuals} downloadPath="/api/model-documents" /></div>
          </section>
        )}
      </div>
    </main>
  );
}
