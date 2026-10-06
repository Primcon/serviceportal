import Link from "next/link";
import { ArrowUpRight, Package, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { listCustomerEquipment } from "@/features/work-orders/customer-queries";
import { shopTimeZone } from "@/lib/dates";
import { customerStatusLabels } from "@/lib/labels";
import { firstParam, pageFromParams, type SearchParams } from "@/lib/pagination";
import { getRequestActor } from "@/services/request-actor";

export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: shopTimeZone });

export default async function CustomerEquipmentIndexPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const actor = await getRequestActor("customer");
  const { equipment, total, page, pageSize } = actor
    ? await listCustomerEquipment(actor.identitySubject, search, { page: pageFromParams(params) })
    : { equipment: [], total: 0, page: 1, pageSize: 20 };

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader description="Every piece of equipment we've serviced for you, with its repair history and manuals." eyebrow="MY EQUIPMENT" icon={<Package size={16} />} title="Your equipment" />

      <form className="mt-6 flex flex-wrap gap-2" key={search} method="get" role="search">
        <label className="sr-only" htmlFor="customer-equipment-search">Search equipment</label>
        <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className={`${fieldStyles} pl-10`} defaultValue={search} id="customer-equipment-search" name="search" placeholder="Model or serial number" /></div>
        <button className={buttonStyles({ size: "sm" })}>Search</button>
        {search && <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/portal/equipment">Reset</Link>}
        <p className="ml-auto self-center text-sm font-bold text-muted">{total} item{total === 1 ? "" : "s"}</p>
      </form>

      <section className="mt-5 border-y border-line bg-paper">
        {equipment.length ? equipment.map((item) => {
          const latest = item.workOrders[0];
          return (
            <Link className="group grid gap-3 border-b border-line px-5 py-5 last:border-b-0 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" href={`/portal/equipment/${item.id}`} key={item.id}>
              <div className="min-w-0">
                <h2 className="text-lg font-bold group-hover:text-brand">{item.productModel}</h2>
                <p className="mt-1 text-sm text-muted">Serial {item.serialNumber} · {item.company.name}</p>
              </div>
              {latest
                ? <p className="flex flex-wrap items-center gap-2 text-sm text-muted sm:justify-end"><Badge tone={latest.customerFacingStatus === "COMPLETED" ? "success" : "brand"}>{customerStatusLabels[latest.customerFacingStatus]}</Badge> Last repair updated {day.format(latest.updatedAt)}</p>
                : <p className="text-sm text-muted">No repairs on record</p>}
              <ArrowUpRight className="hidden text-brand sm:block" size={18} />
            </Link>
          );
        }) : (
          <div className="p-5">
            <EmptyState
              description={search ? "Try another model or serial number." : "Equipment appears here once it has been received for service."}
              icon={<Package size={24} />}
              title={search ? "No equipment matches this search." : "No equipment yet."}
            />
          </div>
        )}
        <Pagination label="items" page={page} pageSize={pageSize} params={params} pathname="/portal/equipment" total={total} />
      </section>
    </main>
  );
}
