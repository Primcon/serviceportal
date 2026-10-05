import Link from "next/link";
import { UserRole } from "@prisma/client";
import { ArrowUpRight, BookOpen, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { AddModelButton } from "@/features/catalog/components/model-tools";
import { listProductModels } from "@/features/catalog/queries";
import { modelDisplayName } from "@/features/work-orders/intake";
import { firstParam, pageFromParams, type SearchParams } from "@/lib/pagination";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

export default async function ModelsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireWorkspaceUser();
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const includeRetired = firstParam(params.retired) === "1";
  const { models, total, page, pageSize } = await listProductModels({ search, page: pageFromParams(params), includeRetired });
  const canManage = viewer.internalRole === UserRole.PORTAL_ADMINISTRATOR || viewer.internalRole === UserRole.VACTECH_MANAGER;
  const filtersApplied = Boolean(search || includeRetired);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <PageHeader
        actions={canManage && <AddModelButton />}
        description="Every pump model VacTech services. Manuals added to a model are available on each pump and work order of that model."
        eyebrow="SERVICE"
        icon={<BookOpen size={16} />}
        title="Models and manuals"
      />

      <form className="mt-6 flex flex-wrap items-center gap-3" method="get" role="search">
        <label className="sr-only" htmlFor="model-search">Search models</label>
        <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className={`${fieldStyles} pl-10`} defaultValue={search} id="model-search" name="search" placeholder="Manufacturer or model" /></div>
        <label className="flex items-center gap-2 text-sm text-muted"><input className="size-4 accent-brand" defaultChecked={includeRetired} name="retired" type="checkbox" value="1" /> Include retired</label>
        <button className={buttonStyles({ size: "sm" })}>Search</button>
        {filtersApplied && <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/workspace/models">Reset</Link>}
        <p className="ml-auto text-sm font-bold text-muted">{total} model{total === 1 ? "" : "s"}</p>
      </form>

      <section className="mt-5 border-y border-line bg-paper">
        {models.length ? models.map((model) => (
          <Link className="group grid gap-2 border-b border-line px-5 py-4 last:border-b-0 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/workspace/models/${model.id}`} key={model.id}>
            <p className="flex flex-wrap items-center gap-2 font-bold group-hover:text-brand">{modelDisplayName(model.manufacturer, model.name)}{!model.isActive && <Badge tone="neutral">Retired</Badge>}</p>
            <p className="flex items-center gap-4 text-sm text-muted">
              <span>{model._count.equipment} pump{model._count.equipment === 1 ? "" : "s"}</span>
              <span className={model._count.documents ? "font-bold text-ink" : ""}>{model._count.documents ? `${model._count.documents} document${model._count.documents === 1 ? "" : "s"}` : "No manuals"}</span>
              <ArrowUpRight className="text-brand" size={16} />
            </p>
          </Link>
        )) : (
          <div className="p-5">
            <EmptyState
              description={filtersApplied ? "Try another name, or clear the search." : "Models are added here, or while entering a pump."}
              icon={<BookOpen size={24} />}
              title={filtersApplied ? "No models match that search." : "No models in the catalog yet."}
            />
          </div>
        )}
        <Pagination label="models" page={page} pageSize={pageSize} params={params} pathname="/workspace/models" total={total} />
      </section>
    </main>
  );
}
