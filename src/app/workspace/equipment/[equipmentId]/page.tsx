import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";
import { Archive, ArrowLeft, ArrowUpRight, BookOpen, ClipboardCheck, ClipboardPlus, Combine, Info, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles, panelStyles } from "@/components/ui/styles";
import { ModelDocumentList } from "@/features/catalog/components/model-document-list";
import { modelDocuments, productModelOptions } from "@/features/catalog/queries";
import { EquipmentTools } from "@/features/records/components/equipment-tools";
import { getInternalEquipment } from "@/features/work-orders/internal-queries";
import { customerStatusLabels, formatEnumLabel } from "@/lib/labels";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

const dateOnly = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function InternalEquipmentPage({ params }: { params: Promise<{ equipmentId: string }> }) {
  const viewer = await requireWorkspaceUser();
  const { equipmentId } = await params;
  const equipment = await getInternalEquipment(equipmentId).catch(() => null);
  if (!equipment) notFound();
  const [models, documents] = await Promise.all([productModelOptions(), modelDocuments(equipment.productModelId)]);
  const canManage = viewer.internalRole === UserRole.PORTAL_ADMINISTRATOR || viewer.internalRole === UserRole.VACTECH_MANAGER;
  const isMerged = Boolean(equipment.mergedInto);

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link className="flex w-fit items-center gap-2 text-sm font-bold text-brand" href="/workspace/equipment"><ArrowLeft size={16} /> Equipment</Link>
      <div className="mt-5">
        <PageHeader
          actions={!isMerged && (
            <>
              {!equipment.archivedAt && <Link className={buttonStyles({ size: "sm" })} href={`/workspace/work-orders/new?equipmentId=${equipment.id}`}><ClipboardPlus size={16} /> New work order</Link>}
              <EquipmentTools
                canManage={canManage}
                locations={equipment.company.locations}
                models={models}
                pump={{ id: equipment.id, companyId: equipment.companyId, productModelId: equipment.productModelId, productModel: equipment.productModel, serialNumber: equipment.serialNumber, description: equipment.description, locationId: equipment.location?.id ?? null, isArchived: Boolean(equipment.archivedAt) }}
                workOrderCount={equipment.workOrders.length}
              />
            </>
          )}
          description={<>Serial {equipment.serialNumber} · {canManage ? <Link className="font-bold text-ink hover:text-brand" href={`/workspace/customers/${equipment.company.id}`}>{equipment.company.name}</Link> : equipment.company.name}{equipment.location && ` · ${equipment.location.name}`}</>}
          eyebrow="PUMP"
          icon={<Package size={16} />}
          title={equipment.productModel}
        />
      </div>

      {equipment.mergedInto && (
        <p className="mt-6 flex flex-wrap items-center gap-2 border-l-4 border-brand bg-brand-soft px-4 py-3 text-sm">
          <Combine className="text-brand" size={16} /> This record was a duplicate and has been merged into
          <Link className="inline-flex items-center gap-1 font-bold text-brand" href={`/workspace/equipment/${equipment.mergedInto.id}`}>{equipment.mergedInto.productModel} · Serial {equipment.mergedInto.serialNumber} <ArrowUpRight size={14} /></Link>
        </p>
      )}
      {equipment.archivedAt && !isMerged && (
        <p className="mt-6 flex items-center gap-2 border-l-4 border-line bg-paper px-4 py-3 text-sm text-muted"><Archive size={16} /> Archived on {dateOnly.format(equipment.archivedAt)}. It no longer appears when opening a work order; its history is kept.</p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section className={panelStyles}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardCheck className="text-brand" size={18} /> Repair history</h2>
            <p className="text-sm text-muted">{equipment.workOrders.length} work order{equipment.workOrders.length === 1 ? "" : "s"}</p>
          </div>
          {equipment.workOrders.length ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {equipment.workOrders.map((workOrder) => (
                <li key={workOrder.id}>
                  <Link className="group grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/workspace/work-orders/${workOrder.id}`}>
                    <div className="min-w-0">
                      <p className="font-bold group-hover:text-brand">{workOrder.workOrderNumber} · {workOrder.summary}</p>
                      <p className="mt-1 text-sm text-muted">
                        {workOrder.serviceStage.displayName}
                        {workOrder.condition !== "NORMAL" && ` · ${formatEnumLabel(workOrder.condition)}`}
                        {workOrder.receivedAt && ` · Received ${dateOnly.format(workOrder.receivedAt)}`}
                        {workOrder.completedAt && ` · Completed ${dateOnly.format(workOrder.completedAt)}`}
                      </p>
                    </div>
                    <Badge tone={workOrder.customerFacingStatus === "COMPLETED" ? "success" : "brand"}>{customerStatusLabels[workOrder.customerFacingStatus]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4"><EmptyState description={isMerged ? "Its work orders moved to the pump it was merged into." : "Open a work order when this pump next arrives."} icon={<ClipboardCheck size={24} />} title="No work orders for this pump yet." /></div>
          )}
        </section>

        <div className="grid gap-6">
          <section className={panelStyles}>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Info className="text-brand" size={18} /> Details</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              {([
                ["Model", equipment.productModelId ? <Link className="hover:text-brand" href={`/workspace/models/${equipment.productModelId}`} key="model">{equipment.productModel}</Link> : <>{equipment.productModel} <span className="font-normal text-muted">(not in the catalog)</span></>],
                ["Serial", equipment.serialNumber],
                ["Customer", equipment.company.name],
                ["Location", equipment.location?.name],
                ["Description", equipment.description],
              ] as const).map(([label, value]) => (
                <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3" key={label}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="break-words font-bold">{value || <span className="font-normal text-subtle">Not recorded</span>}</dd>
                </div>
              ))}
            </dl>
            {equipment.mergedFrom.length > 0 && (
              <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
                Includes the history of {equipment.mergedFrom.length === 1 ? "a duplicate record" : "duplicate records"} merged into this one: {equipment.mergedFrom.map((duplicate, index) => (
                  <span key={duplicate.id}>{index > 0 && ", "}<Link className="font-bold text-ink hover:text-brand" href={`/workspace/equipment/${duplicate.id}`}>serial {duplicate.serialNumber}</Link></span>
                ))}.
              </p>
            )}
          </section>

          <section className={panelStyles}>
            <h2 className="flex items-center gap-2 text-lg font-bold"><BookOpen className="text-brand" size={18} /> Manuals for this model</h2>
            {documents.length ? (
              <div className="mt-2"><ModelDocumentList documents={documents} downloadPath="/api/internal/model-documents" showVisibility /></div>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {equipment.productModelId ? "No manuals have been added for this model yet." : "Link this pump to a catalog model to see its manuals here."}
                {equipment.productModelId && canManage && <> <Link className="font-bold text-brand" href={`/workspace/models/${equipment.productModelId}`}>Add one</Link></>}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
