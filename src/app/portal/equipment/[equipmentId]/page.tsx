import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardList, Package, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { panelStyles } from "@/components/ui/styles";
import { ModelDocumentList } from "@/features/catalog/components/model-document-list";
import { customerStageLabel } from "@/features/customer/progress";
import { getCustomerEquipment } from "@/features/work-orders/customer-queries";
import { shopTimeZone } from "@/lib/dates";
import { customerStatusLabels } from "@/lib/labels";
import { warrantyState } from "@/features/warranty/warranty";
import { getRequestActor } from "@/services/request-actor";

export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: shopTimeZone });
const calendarDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function CustomerEquipmentPage({ params }: { params: Promise<{ equipmentId: string }> }) {
  const { equipmentId } = await params;
  const actor = await getRequestActor("customer");
  const equipment = actor ? await getCustomerEquipment(actor.identitySubject, equipmentId).catch(() => null) : null;
  if (!equipment) notFound();
  const manuals = equipment.catalogModel?.documents ?? [];

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link className="flex w-fit items-center gap-2 text-sm font-bold text-brand" href="/portal/equipment"><ArrowLeft size={16} /> Equipment</Link>
      <div className="mt-5">
        <PageHeader description={<>Serial {equipment.serialNumber} · {equipment.company.name}{equipment.description && <span className="mt-1 block">{equipment.description}</span>}</>} eyebrow="EQUIPMENT" icon={<Package size={16} />} title={equipment.productModel} />
      </div>

      {equipment.warrantyEndsAt && warrantyState(equipment.warrantyEndsAt) === "active" && (
        <p className="mt-6 flex items-center gap-2 border-l-4 border-brand bg-paper px-4 py-3 text-sm"><ShieldCheck className="shrink-0 text-brand" size={17} /> <span>The last repair on this equipment is under warranty until <span className="font-bold">{calendarDay.format(equipment.warrantyEndsAt)}</span>.</span></p>
      )}

      <div className={`mt-6 grid gap-6 ${manuals.length ? "lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start" : ""}`}>
        <section className={panelStyles}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardList className="text-brand" size={18} /> Service history</h2>
            <p className="text-sm text-muted">{equipment.workOrders.length} repair{equipment.workOrders.length === 1 ? "" : "s"}</p>
          </div>
          {equipment.workOrders.length ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {equipment.workOrders.map((workOrder) => (
                <li key={workOrder.id}>
                  <Link className="group flex flex-wrap items-center justify-between gap-3 py-4" href={`/portal/work-orders/${workOrder.id}`}>
                    <span className="min-w-0">
                      <span className="block font-bold group-hover:text-brand">{workOrder.workOrderNumber} · {workOrder.summary}</span>
                      <span className="block text-sm text-muted">{customerStageLabel(workOrder.serviceStage)} · Updated {day.format(workOrder.updatedAt)}</span>
                    </span>
                    <Badge tone={workOrder.customerFacingStatus === "COMPLETED" ? "success" : "brand"}>{customerStatusLabels[workOrder.customerFacingStatus]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">No repairs on record for this equipment yet.</p>}
        </section>

        {manuals.length > 0 && (
          <section className={panelStyles}>
            <h2 className="flex items-center gap-2 text-lg font-bold"><BookOpen className="text-brand" size={18} /> Manuals and documents</h2>
            <div className="mt-2"><ModelDocumentList documents={manuals} downloadPath="/api/model-documents" /></div>
          </section>
        )}
      </div>
    </main>
  );
}
