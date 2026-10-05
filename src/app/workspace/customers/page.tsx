import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Building2, MapPin, Package, Search, Wrench } from "lucide-react";
import CustomerLocationCommands from "@/components/customer-location-commands";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { managerRoles } from "@/features/navigation/workspace-items";
import { firstParam, pageFromParams, pageWindow, type SearchParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

const pageSize = 25;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser(managerRoles);
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const includeArchived = firstParam(params.archived) === "1";
  const page = pageFromParams(params);
  const where: Prisma.CompanyWhereInput = {
    ...(includeArchived ? {} : { archivedAt: null }),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { locations: { some: { name: { contains: search, mode: "insensitive" } } } }] } : {}),
  };

  const [total, companies, allCompanies, totals] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: { name: "asc" },
      ...pageWindow(page, pageSize),
      select: {
        id: true,
        name: true,
        archivedAt: true,
        mergedIntoId: true,
        locations: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true, region: true } },
        _count: { select: { equipment: { where: { mergedIntoId: null } }, workOrders: true } },
      },
    }),
    prisma.company.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    Promise.all([
      prisma.company.count({ where: { archivedAt: null } }),
      prisma.location.count({ where: { archivedAt: null } }),
      prisma.equipment.count({ where: { archivedAt: null } }),
      prisma.workOrder.count(),
    ]),
  ]);
  const [customerCount, locationCount, equipmentCount, workOrderCount] = totals;
  const tiles = [
    { label: "Customer companies", value: customerCount, icon: <Building2 className="text-brand" size={20} />, accent: true },
    { label: "Service locations", value: locationCount, icon: <MapPin className="text-ink" size={20} /> },
    { label: "Pumps", value: equipmentCount, icon: <Package className="text-ink" size={20} /> },
    { label: "Work orders", value: workOrderCount, icon: <Wrench className="text-ink" size={20} /> },
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <PageHeader
        actions={<CustomerLocationCommands companies={allCompanies} />}
        description="Each customer's locations, pumps and work orders. Open a customer to rename, archive or merge it."
        eyebrow="CUSTOMERS"
        title="Customers and locations"
      />

      <section aria-label="Customer directory summary" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div className={`border-l-4 bg-paper p-5 ${tile.accent ? "border-brand" : "border-line"}`} key={tile.label}>
            {tile.icon}
            <p className="mt-4 text-3xl font-bold tabular-nums">{tile.value}</p>
            <p className="mt-1 text-sm text-muted">{tile.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div><h2 className="text-xl font-bold">Customer directory</h2><p className="mt-1 text-sm text-muted">Service footprint by customer company.</p></div>
          <form className="flex flex-wrap items-center gap-2" method="get" role="search">
            <label className="sr-only" htmlFor="customer-search">Search customers</label>
            <div className="relative"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className={`${fieldStyles} pl-10`} defaultValue={search} id="customer-search" name="search" placeholder="Customer or location" /></div>
            <label className="flex items-center gap-2 text-sm text-muted"><input className="size-4 accent-brand" defaultChecked={includeArchived} name="archived" type="checkbox" value="1" /> Include archived</label>
            <button className={buttonStyles({ size: "sm" })}>Search</button>
            {(search || includeArchived) && <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/workspace/customers">Reset</Link>}
          </form>
        </div>
        {companies.length ? (
          <div className="mt-5 border-y border-line bg-paper">
            {companies.map((company) => (
              <article className="grid gap-4 border-b border-line px-5 py-5 last:border-b-0 lg:grid-cols-[minmax(240px,0.9fr)_minmax(0,1.4fr)_auto] lg:items-center" key={company.id}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center bg-brand-soft text-brand"><Building2 size={19} /></span>
                  <div>
                    <h3 className="flex flex-wrap items-center gap-2 font-bold"><Link className="hover:text-brand" href={`/workspace/customers/${company.id}`}>{company.name}</Link>{company.archivedAt && <Badge tone="neutral">{company.mergedIntoId ? "Merged duplicate" : "Archived"}</Badge>}</h3>
                    <p className="mt-1 text-sm text-muted">{company.locations.length ? `${company.locations.length} service location${company.locations.length === 1 ? "" : "s"}` : "No service locations recorded"}</p>
                  </div>
                </div>
                <div className="border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  {company.locations.length ? (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {company.locations.map((location) => (
                        <li className="flex items-start gap-2 text-sm" key={location.id}>
                          <MapPin className="mt-0.5 shrink-0 text-brand" size={16} />
                          <span><span className="font-bold">{location.name}</span>{(location.city || location.region) && <span className="block text-muted">{[location.city, location.region].filter(Boolean).join(", ")}</span>}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">Add a location to organize this customer&apos;s equipment and work orders.</p>}
                </div>
                <div className="flex gap-5 border-t border-line pt-4 text-right text-sm lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <Link className="hover:text-brand" href={`/workspace/equipment?companyId=${company.id}`}><p className="font-bold">{company._count.equipment}</p><p className="text-xs text-muted">Pumps</p></Link>
                  <Link className="hover:text-brand" href={`/workspace/work-orders?company=${company.id}`}><p className="font-bold">{company._count.workOrders}</p><p className="text-xs text-muted">Work orders</p></Link>
                </div>
              </article>
            ))}
            <Pagination label="customers" page={page} pageSize={pageSize} params={params} pathname="/workspace/customers" total={total} />
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              description={search ? "Try another name, or clear the search." : "Create a customer company to begin organizing service locations and equipment."}
              icon={<Building2 size={28} />}
              title={search ? "No customers match that search." : "No customers have been added yet."}
            />
          </div>
        )}
      </section>
    </main>
  );
}
