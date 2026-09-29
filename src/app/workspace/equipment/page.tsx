import Link from "next/link";
import { Package, Search, SlidersHorizontal } from "lucide-react";
import EquipmentCreateForm from "@/components/equipment-create-form";
import { prisma } from "@/lib/prisma";
import { fieldStyles } from "@/components/ui/styles";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser();
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const companyId = firstParam(params.companyId) ?? "";
  const locationId = firstParam(params.locationId) ?? "";
  const productModel = firstParam(params.productModel) ?? "";
  const [companies, locations, productModels, equipment, existingEquipment] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.location.findMany({ orderBy: [{ companyId: "asc" }, { name: "asc" }], select: { id: true, name: true, company: { select: { name: true } } } }),
    prisma.equipment.findMany({ distinct: ["productModel"], orderBy: { productModel: "asc" }, select: { productModel: true } }),
    prisma.equipment.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        ...(locationId ? { locationId } : {}),
        ...(productModel ? { productModel } : {}),
        ...(search ? {
          OR: [
            { productModel: { contains: search, mode: "insensitive" } },
            { serialNumber: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
            { location: { name: { contains: search, mode: "insensitive" } } },
          ],
        } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, productModel: true, serialNumber: true, description: true, company: { select: { name: true } }, location: { select: { name: true } }, workOrders: { select: { id: true } } },
    }),
    prisma.equipment.findMany({ select: { id: true, companyId: true, productModel: true, serialNumber: true, company: { select: { name: true } }, location: { select: { name: true } } } }),
  ]);
  const filtersApplied = Boolean(search || companyId || locationId || productModel);

  return (
    <main className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-7">
          <div><p className="text-sm font-bold tracking-[0.1em] text-brand">OPERATIONS</p><h1 className="mt-2 text-3xl font-bold">Equipment register</h1><p className="mt-2 max-w-2xl text-muted">Find service assets by customer, location, model, or serial number, then open their complete repair history.</p></div>
          <p className="text-sm font-bold text-muted">{equipment.length} asset{equipment.length === 1 ? "" : "s"}</p>
        </div>

        <section aria-label="Equipment filters" className="mt-6 border border-line bg-paper p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-body"><SlidersHorizontal className="text-brand" size={17} /> Find equipment</div><EquipmentCreateForm companies={companies} existingEquipment={existingEquipment} locations={locations} /></div>
          <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="sr-only" htmlFor="equipment-search">Search equipment</label>
            <div className="relative"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className="w-full border border-line bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand" defaultValue={search} id="equipment-search" name="search" placeholder="Model, serial, customer, location" /></div>
            <label className="sr-only" htmlFor="filter-company">Customer company</label>
            <select className={fieldStyles} defaultValue={companyId} id="filter-company" name="companyId"><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
            <label className="sr-only" htmlFor="filter-product-model">Product model</label>
            <select className={fieldStyles} defaultValue={productModel} id="filter-product-model" name="productModel"><option value="">All product models</option>{productModels.map((item) => <option key={item.productModel} value={item.productModel}>{item.productModel}</option>)}</select>
            <label className="sr-only" htmlFor="filter-location">Service location</label>
            <select className={fieldStyles} defaultValue={locationId} id="filter-location" name="locationId"><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.company.name} · {location.name}</option>)}</select>
            <div className="flex gap-2"><button className="flex-1 bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">Apply filters</button>{filtersApplied && <Link className="border border-brand px-3 py-2.5 text-sm font-bold text-brand" href="/workspace/equipment">Reset</Link>}</div>
          </form>
        </section>

        <section className="mt-6 border-y border-line bg-paper">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4"><h2 className="font-bold">Equipment records</h2><p className="text-sm text-muted">{filtersApplied ? "Filtered results" : "All active records"}</p></div>
          {equipment.length ? equipment.map((item) => <Link className="group grid gap-3 border-b border-line px-5 py-5 last:border-b-0 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto]" href={`/workspace/equipment/${item.id}`} key={item.id}>
            <div><p className="font-bold group-hover:text-brand">{item.productModel}</p><p className="mt-1 text-sm text-muted">Serial {item.serialNumber} · {item.company.name}{item.location && ` · ${item.location.name}`}</p>{item.description && <p className="mt-2 text-sm text-body">{item.description}</p>}</div>
            <p className="text-sm font-bold text-brand">{item.workOrders.length} work order{item.workOrders.length === 1 ? "" : "s"}</p>
          </Link>) : <div className="px-5 py-14 text-center"><Package className="mx-auto mb-3 text-muted" size={24} /><p className="font-bold">{filtersApplied ? "No equipment matches these filters." : "No equipment recorded yet."}</p><p className="mt-1 text-sm text-muted">{filtersApplied ? "Change or clear the filters to broaden the results." : "Add an asset before opening its first work order."}</p></div>}
        </section>

      </div>
    </main>
  );
}