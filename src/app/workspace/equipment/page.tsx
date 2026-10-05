import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ArrowUpRight, Package, Search, SlidersHorizontal } from "lucide-react";
import EquipmentCreateForm from "@/components/equipment-create-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { productModelOptions } from "@/features/catalog/queries";
import { firstParam, pageFromParams, pageWindow, type SearchParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

const pageSize = 25;

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser();
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const companyId = firstParam(params.companyId) ?? "";
  const locationId = firstParam(params.locationId) ?? "";
  const modelId = firstParam(params.model) ?? "";
  const includeArchived = firstParam(params.archived) === "1";
  const page = pageFromParams(params);

  const where: Prisma.EquipmentWhereInput = {
    ...(includeArchived ? {} : { archivedAt: null }),
    ...(companyId ? { companyId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(modelId ? { productModelId: modelId } : {}),
    ...(search ? {
      OR: [
        { productModel: { contains: search, mode: "insensitive" } },
        { serialNumber: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { company: { name: { contains: search, mode: "insensitive" } } },
        { location: { name: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };

  const [total, equipment, companies, locations, models] = await Promise.all([
    prisma.equipment.count({ where }),
    prisma.equipment.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      ...pageWindow(page, pageSize),
      select: { id: true, productModel: true, serialNumber: true, description: true, archivedAt: true, mergedIntoId: true, company: { select: { name: true } }, location: { select: { name: true } }, _count: { select: { workOrders: true } } },
    }),
    prisma.company.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, locations: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
    prisma.location.findMany({ where: { archivedAt: null }, orderBy: [{ company: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, company: { select: { name: true } } } }),
    productModelOptions(),
  ]);
  const filtersApplied = Boolean(search || companyId || locationId || modelId || includeArchived);

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <PageHeader
        actions={<EquipmentCreateForm companies={companies} defaultCompanyId={companies.some((company) => company.id === companyId) ? companyId : ""} models={models} />}
        description="Find pumps by customer, location, model or serial number, then open their complete repair history."
        eyebrow="OPERATIONS"
        title="Equipment register"
      />

      <section aria-label="Equipment filters" className="mt-6 border border-line bg-paper p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-body"><SlidersHorizontal className="text-brand" size={17} /> Find equipment</div>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" method="get">
          <label className="sr-only" htmlFor="equipment-search">Search equipment</label>
          <div className="relative"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className={`${fieldStyles} pl-10`} defaultValue={search} id="equipment-search" name="search" placeholder="Model, serial, customer, location" /></div>
          <label className="sr-only" htmlFor="filter-company">Customer company</label>
          <select className={fieldStyles} defaultValue={companyId} id="filter-company" name="companyId"><option value="">All customers</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
          <label className="sr-only" htmlFor="filter-model">Model</label>
          <select className={fieldStyles} defaultValue={modelId} id="filter-model" name="model"><option value="">All models</option>{models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select>
          <label className="sr-only" htmlFor="filter-location">Service location</label>
          <select className={fieldStyles} defaultValue={locationId} id="filter-location" name="locationId"><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.company.name} · {location.name}</option>)}</select>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-4">
            <button className={buttonStyles({ size: "sm" })}>Apply filters</button>
            {filtersApplied && <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/workspace/equipment">Reset</Link>}
            <label className="flex items-center gap-2 text-sm text-muted"><input className="size-4 accent-brand" defaultChecked={includeArchived} name="archived" type="checkbox" value="1" /> Include archived</label>
            <p className="ml-auto text-sm font-bold text-muted">{total} pump{total === 1 ? "" : "s"}</p>
          </div>
        </form>
      </section>

      <section className="mt-6 border-y border-line bg-paper">
        {equipment.length ? equipment.map((item) => (
          <Link className="group grid gap-3 border-b border-line px-5 py-5 last:border-b-0 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto]" href={`/workspace/equipment/${item.id}`} key={item.id}>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-bold group-hover:text-brand">{item.productModel}{item.archivedAt && <Badge tone="neutral">{item.mergedIntoId ? "Merged duplicate" : "Archived"}</Badge>}</p>
              <p className="mt-1 text-sm text-muted">Serial {item.serialNumber} · {item.company.name}{item.location && ` · ${item.location.name}`}</p>
              {item.description && <p className="mt-2 text-sm text-body">{item.description}</p>}
            </div>
            <p className="flex items-center gap-2 text-sm font-bold text-brand">{item._count.workOrders} work order{item._count.workOrders === 1 ? "" : "s"} <ArrowUpRight size={16} /></p>
          </Link>
        )) : (
          <div className="p-5">
            <EmptyState
              description={filtersApplied ? "Change or clear the filters to broaden the results." : "Add a pump before opening its first work order."}
              icon={<Package size={24} />}
              title={filtersApplied ? "No equipment matches these filters." : "No equipment recorded yet."}
            />
          </div>
        )}
        <Pagination label="pumps" page={page} pageSize={pageSize} params={params} pathname="/workspace/equipment" total={total} />
      </section>
    </main>
  );
}
