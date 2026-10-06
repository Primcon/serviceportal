import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ArrowLeft, BookOpen, Download, Package, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles, panelStyles } from "@/components/ui/styles";
import { formatFileSize } from "@/features/catalog/components/model-document-list";
import { ModelDocumentTools, ModelDocumentUpload, ModelTools } from "@/features/catalog/components/model-tools";
import { getProductModel, productModelOptions } from "@/features/catalog/queries";
import { modelDisplayName } from "@/features/work-orders/intake";
import { documentTypeLabels } from "@/lib/labels";
import { requireWorkspaceUser } from "@/services/page-access";
import { shopTimeZone } from "@/lib/dates";

export const dynamic = "force-dynamic";

const dateOnly = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: shopTimeZone });

export default async function ModelPage({ params }: { params: Promise<{ modelId: string }> }) {
  const viewer = await requireWorkspaceUser();
  const { modelId } = await params;
  const model = await getProductModel(modelId).catch(() => null);
  if (!model) notFound();
  const canManage = viewer.internalRole === UserRole.PORTAL_ADMINISTRATOR || viewer.internalRole === UserRole.VACTECH_MANAGER;
  const otherModels = canManage ? (await productModelOptions()).filter((other) => other.id !== model.id) : [];
  const pumpCount = model._count.equipment;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link className="flex w-fit items-center gap-2 text-sm font-bold text-brand" href="/workspace/models"><ArrowLeft size={16} /> Models and manuals</Link>
      <div className="mt-5">
        <PageHeader
          actions={(
            <>
              <Link className={buttonStyles({ variant: "outline", size: "sm" })} href={`/workspace/equipment?model=${model.id}`}><Package size={15} /> {pumpCount} pump{pumpCount === 1 ? "" : "s"}</Link>
              {canManage && <ModelTools model={{ id: model.id, manufacturer: model.manufacturer, name: model.name, isActive: model.isActive }} otherModels={otherModels} pumpCount={pumpCount} />}
            </>
          )}
          description={model.isActive ? "Documents here are available on every pump and work order of this model." : "Retired: no longer offered when adding pumps. Existing pumps keep it."}
          eyebrow={model.manufacturer ? model.manufacturer.toUpperCase() : "MODEL"}
          icon={<BookOpen size={16} />}
          title={modelDisplayName(model.manufacturer, model.name)}
        />
      </div>

      <div className={`mt-6 grid gap-6 ${canManage ? "lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start" : ""}`}>
        <section className={panelStyles}>
          <h2 className="flex items-center gap-2 text-lg font-bold"><BookOpen className="text-brand" size={18} /> Manuals and documents</h2>
          {model.documents.length ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {model.documents.map((document) => (
                <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={document.id}>
                  <a className="group flex min-w-0 items-start gap-3" href={`/api/internal/model-documents/${document.id}`}>
                    <Download className="mt-0.5 shrink-0 text-brand" size={17} />
                    <span className="min-w-0">
                      <span className="block font-bold group-hover:text-brand">{document.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {documentTypeLabels[document.documentType]} · {formatFileSize(document.sizeBytes)} · Added {dateOnly.format(document.uploadedAt)} by {document.uploadedBy.displayName}
                        <Badge tone={document.visibility === "CUSTOMER_VISIBLE" ? "success" : "neutral"}>{document.visibility === "CUSTOMER_VISIBLE" ? "Customers can see this" : "Staff only"}</Badge>
                      </span>
                    </span>
                  </a>
                  {canManage && <ModelDocumentTools document={{ id: document.id, title: document.title, visibility: document.visibility }} />}
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">No manuals yet.{canManage ? " Upload the first one here." : " A manager can add them."}</p>}
        </section>

        {canManage && (
          <section className={panelStyles}>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Upload className="text-brand" size={18} /> Add a document</h2>
            <div className="mt-4"><ModelDocumentUpload modelId={model.id} /></div>
          </section>
        )}
      </div>
    </main>
  );
}
