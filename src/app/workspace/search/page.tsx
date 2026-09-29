import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Building2, ClipboardList, Package, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { findWorkOrderByExactNumber, searchWorkspace } from "@/features/search/queries";
import { customerStatusLabels } from "@/lib/labels";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function ResultGroup({ icon, title, count, seeAllHref, children }: { icon: ReactNode; title: string; count: number; seeAllHref?: string; children: ReactNode }) {
  return (
    <section className="border border-line bg-paper">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2 font-bold">{icon}{title}<span className="text-sm font-normal text-muted">({count}{count === 10 ? "+" : ""})</span></h2>
        {seeAllHref && count > 0 && <Link className="text-sm font-bold text-brand" href={seeAllHref}>See all</Link>}
      </div>
      {count ? <div className="divide-y divide-line">{children}</div> : <p className="px-5 py-4 text-sm text-muted">No matches.</p>}
    </section>
  );
}

export default async function WorkspaceSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireWorkspaceUser();
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  if (query) {
    // A WIP number typed exactly (from a traveler or a phone call) opens that work order.
    const exact = await findWorkOrderByExactNumber(query);
    if (exact.length === 1) redirect(`/workspace/work-orders/${exact[0].id}`);
  }
  const results = await searchWorkspace(query, viewer.internalRole);
  const encoded = encodeURIComponent(query);
  const total = results.workOrders.length + results.equipment.length + results.customers.length;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <PageHeader eyebrow="SEARCH" title={query ? `Results for "${query}"` : "Search"} description="Search work orders by WIP number, serial, PO, RMA, tool ID or customer; equipment by serial or model; and customers by name." />
      <form action="/workspace/search" className="mt-6 flex gap-2" method="get" role="search">
        <label className="sr-only" htmlFor="search-page-query">Search</label>
        <input autoFocus className={fieldStyles} defaultValue={query} id="search-page-query" name="q" placeholder="WIP number, serial, PO, customer..." />
        <button className={buttonStyles()}><Search size={16} /> Search</button>
      </form>

      {!query ? null : total === 0 ? (
        <div className="mt-6"><EmptyState icon={<Search size={26} />} title="Nothing matches that search." description="Check the spelling, or try part of a serial or WIP number." /></div>
      ) : (
        <div className="mt-6 grid gap-5">
          <ResultGroup count={results.workOrders.length} icon={<ClipboardList className="text-brand" size={18} />} seeAllHref={`/workspace/work-orders?search=${encoded}`} title="Work orders">
            {results.workOrders.map((workOrder) => (
              <Link className="group grid gap-2 px-5 py-4 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto]" href={`/workspace/work-orders/${workOrder.id}`} key={workOrder.id}>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand">{workOrder.workOrderNumber}</p>
                  <p className="mt-1 truncate font-bold group-hover:text-brand">{workOrder.summary}</p>
                  <p className="mt-1 text-sm text-muted">{workOrder.company.name} · {workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}</p>
                </div>
                <div className="flex items-start gap-2 text-sm sm:text-right">
                  <div><p className="font-bold">{workOrder.serviceStage.displayName}</p><p className="mt-1 text-muted">{customerStatusLabels[workOrder.customerFacingStatus]}</p></div>
                  <ArrowUpRight className="text-brand" size={16} />
                </div>
              </Link>
            ))}
          </ResultGroup>

          <ResultGroup count={results.equipment.length} icon={<Package className="text-brand" size={18} />} seeAllHref={`/workspace/equipment?search=${encoded}`} title="Equipment">
            {results.equipment.map((item) => (
              <Link className="group flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface" href={`/workspace/equipment/${item.id}`} key={item.id}>
                <div className="min-w-0">
                  <p className="font-bold group-hover:text-brand">{item.productModel} {item.archivedAt && <Badge tone="neutral">Archived</Badge>}</p>
                  <p className="mt-1 text-sm text-muted">Serial {item.serialNumber} · {item.company.name}</p>
                </div>
                <ArrowUpRight className="shrink-0 text-brand" size={16} />
              </Link>
            ))}
          </ResultGroup>

          {results.canSeeCustomers && (
            <ResultGroup count={results.customers.length} icon={<Building2 className="text-brand" size={18} />} title="Customers">
              {results.customers.map((company) => (
                <Link className="group flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface" href={`/workspace/equipment?companyId=${company.id}`} key={company.id}>
                  <div>
                    <p className="font-bold group-hover:text-brand">{company.name} {company.archivedAt && <Badge tone="neutral">Archived</Badge>}</p>
                    <p className="mt-1 text-sm text-muted">{company._count.equipment} pumps · {company._count.workOrders} work orders</p>
                  </div>
                  <ArrowUpRight className="shrink-0 text-brand" size={16} />
                </Link>
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </main>
  );
}
