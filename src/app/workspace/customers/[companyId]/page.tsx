import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";
import { Archive, ArrowLeft, ArrowUpRight, Building2, ClipboardList, Combine, MapPin, Package, ShieldCheck, UsersRound } from "lucide-react";
import EquipmentCreateForm from "@/components/equipment-create-form";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { panelStyles } from "@/components/ui/styles";
import { productModelOptions } from "@/features/catalog/queries";
import { managerRoles } from "@/features/navigation/workspace-items";
import { AddLocationButton, CustomerTools, InviteCustomerButton, LocationTools } from "@/features/records/components/customer-tools";
import { openWorkOrderWhere } from "@/features/records/merge";
import { WarrantyMonthsButton } from "@/features/warranty/components/warranty-tools";
import { warrantyLengthLabel } from "@/features/warranty/warranty";
import { customerStatusLabels } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { isPlaceholderIdentity } from "@/services/identity-linking";
import { requireWorkspaceUser } from "@/services/page-access";
import { shopTimeZone } from "@/lib/dates";

export const dynamic = "force-dynamic";

const dateOnly = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: shopTimeZone });

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export default async function CustomerPage({ params }: { params: Promise<{ companyId: string }> }) {
  await requireWorkspaceUser(managerRoles);
  const { companyId } = await params;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      contractWarrantyMonths: true,
      archivedAt: true,
      mergedInto: { select: { id: true, name: true } },
      mergedFrom: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      locations: {
        orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
        select: { id: true, name: true, addressLine: true, city: true, region: true, postalCode: true, country: true, archivedAt: true, _count: { select: { equipment: { where: { mergedIntoId: null } } } } },
      },
      userAccess: {
        where: { role: UserRole.CUSTOMER_USER },
        orderBy: { user: { displayName: "asc" } },
        select: { id: true, scope: true, location: { select: { name: true } }, user: { select: { displayName: true, email: true, isActive: true, identitySubject: true } } },
      },
      workOrders: {
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, workOrderNumber: true, summary: true, customerFacingStatus: true, updatedAt: true, equipment: { select: { productModel: true, serialNumber: true } } },
      },
      _count: { select: { equipment: { where: { mergedIntoId: null } }, workOrders: true } },
    },
  }).catch(() => null);
  if (!company) notFound();

  const isMerged = Boolean(company.mergedInto);
  const [openWorkOrders, otherCustomers, models] = await Promise.all([
    prisma.workOrder.count({ where: { companyId: company.id, ...openWorkOrderWhere } }),
    isMerged ? [] : prisma.company.findMany({ where: { archivedAt: null, id: { not: company.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    productModelOptions(),
  ]);
  const activeLocations = company.locations.filter((location) => !location.archivedAt);
  const summary = `${plural(company._count.equipment, "pump")}, ${plural(company._count.workOrders, "work order")}`;
  const tiles = [
    { label: "Open work orders", value: openWorkOrders, href: `/workspace/work-orders?company=${company.id}`, icon: <ClipboardList size={18} /> },
    { label: "Work orders in all", value: company._count.workOrders, href: `/workspace/work-orders?company=${company.id}`, icon: <ClipboardList size={18} /> },
    { label: "Pumps", value: company._count.equipment, href: `/workspace/equipment?companyId=${company.id}`, icon: <Package size={18} /> },
    { label: "People with portal access", value: new Set(company.userAccess.map((grant) => grant.user.email)).size, href: "#access", icon: <UsersRound size={18} /> },
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link className="flex w-fit items-center gap-2 text-sm font-bold text-brand" href="/workspace/customers"><ArrowLeft size={16} /> Customers</Link>
      <div className="mt-5">
        <PageHeader
          actions={!isMerged && <CustomerTools customer={{ id: company.id, name: company.name, isArchived: Boolean(company.archivedAt) }} otherCustomers={otherCustomers} summary={summary} />}
          description={`${plural(activeLocations.length, "location")}, ${summary}.`}
          eyebrow="CUSTOMER"
          icon={<Building2 size={16} />}
          title={company.name}
        />
      </div>

      {company.mergedInto && (
        <p className="mt-6 flex flex-wrap items-center gap-2 border-l-4 border-brand bg-brand-soft px-4 py-3 text-sm">
          <Combine className="text-brand" size={16} /> This record was a duplicate and has been merged into
          <Link className="inline-flex items-center gap-1 font-bold text-brand" href={`/workspace/customers/${company.mergedInto.id}`}>{company.mergedInto.name} <ArrowUpRight size={14} /></Link>
        </p>
      )}
      {company.archivedAt && !isMerged && (
        <p className="mt-6 flex items-center gap-2 border-l-4 border-line bg-paper px-4 py-3 text-sm text-muted"><Archive size={16} /> Archived on {dateOnly.format(company.archivedAt)}. It isn&apos;t offered for new pumps or work orders; its history is kept, and its customer logins still work.</p>
      )}

      <section aria-label="Customer summary" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Link className="group border-l-4 border-line bg-paper p-5 hover:border-brand" href={tile.href} key={tile.label}>
            <span className="text-muted group-hover:text-brand">{tile.icon}</span>
            <p className="mt-3 text-3xl font-bold tabular-nums">{tile.value}</p>
            <p className="mt-1 text-sm text-muted">{tile.label}</p>
          </Link>
        ))}
      </section>

      {!isMerged && (
        <section className={`${panelStyles} mt-6 flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="text-brand" size={18} /> Contract warranty</h2>
            <p className="mt-1 text-sm text-muted">{company.contractWarrantyMonths ? <><span className="font-bold text-ink">{warrantyLengthLabel(company.contractWarrantyMonths)}</span> from the ship date on every repair, in place of each model&apos;s standard warranty.</> : "No contract terms. This customer's repairs get each model's standard warranty."}</p>
          </div>
          <WarrantyMonthsButton kind="contract" months={company.contractWarrantyMonths} recordId={company.id} />
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <section className={panelStyles}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold"><MapPin className="text-brand" size={18} /> Locations</h2>
            {!company.archivedAt && <AddLocationButton companyId={company.id} />}
          </div>
          {company.locations.length ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {company.locations.map((location) => {
                const address = [location.addressLine, [location.city, location.region].filter(Boolean).join(", "), location.postalCode, location.country].filter(Boolean).join(" · ");
                return (
                  <li className="flex flex-wrap items-start justify-between gap-3 py-3" key={location.id}>
                    <div className="min-w-0">
                      <p className={`flex flex-wrap items-center gap-2 font-bold ${location.archivedAt ? "text-muted" : ""}`}>{location.name}{location.archivedAt && <Badge tone="neutral">Archived</Badge>}</p>
                      <p className="mt-0.5 text-sm text-muted">{address || "No address recorded"} · <Link className="hover:text-brand" href={`/workspace/equipment?locationId=${location.id}`}>{plural(location._count.equipment, "pump")}</Link></p>
                    </div>
                    {!isMerged && <LocationTools location={{ id: location.id, name: location.name, addressLine: location.addressLine, city: location.city, region: location.region, postalCode: location.postalCode, country: location.country, isArchived: Boolean(location.archivedAt) }} />}
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">{isMerged ? "Its locations moved to the customer it was merged into." : "No locations yet. Add one to organize this customer's pumps by site."}</p>}
        </section>

        <section className={panelStyles}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardList className="text-brand" size={18} /> Recent work orders</h2>
            {!company.archivedAt && <EquipmentCreateForm companies={[{ id: company.id, name: company.name, locations: activeLocations.map((location) => ({ id: location.id, name: location.name })) }]} defaultCompanyId={company.id} models={models} />}
          </div>
          {company.workOrders.length ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {company.workOrders.map((workOrder) => (
                <li key={workOrder.id}>
                  <Link className="group flex flex-wrap items-center justify-between gap-3 py-3" href={`/workspace/work-orders/${workOrder.id}`}>
                    <span className="min-w-0">
                      <span className="block font-bold group-hover:text-brand">{workOrder.workOrderNumber} · {workOrder.summary}</span>
                      <span className="block text-sm text-muted">{workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber} · Updated {dateOnly.format(workOrder.updatedAt)}</span>
                    </span>
                    <Badge tone={workOrder.customerFacingStatus === "COMPLETED" ? "success" : "brand"}>{customerStatusLabels[workOrder.customerFacingStatus]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">{isMerged ? "Its work orders moved to the customer it was merged into." : "No work orders for this customer yet."}</p>}
        </section>

        <section className={`${panelStyles} lg:col-span-2`} id="access">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold"><UsersRound className="text-brand" size={18} /> Who can sign in for this customer</h2>
            <div className="flex flex-wrap items-center gap-3">
              {!company.archivedAt && <InviteCustomerButton companyId={company.id} companyName={company.name} locations={activeLocations.map((location) => ({ id: location.id, name: location.name }))} />}
              <Link className="text-sm font-bold text-brand" href="/workspace/users">Manage in Users</Link>
            </div>
          </div>
          {company.userAccess.length ? (
            <ul className="mt-4 grid gap-x-8 divide-y divide-line border-y border-line sm:grid-cols-2 sm:divide-y-0">
              {company.userAccess.map((grant) => (
                <li className="flex flex-wrap items-center justify-between gap-2 py-3 sm:border-b sm:border-line" key={grant.id}>
                  <span className="min-w-0"><span className="block font-bold">{grant.user.displayName}</span><span className="block truncate text-sm text-muted">{grant.user.email}</span></span>
                  <span className="flex items-center gap-2">
                    <Badge tone="outline">{grant.scope === "COMPANY" ? "All locations" : grant.location?.name ?? "One location"}</Badge>
                    {isPlaceholderIdentity(grant.user.identitySubject) && grant.user.isActive && <Badge tone="neutral">Hasn&apos;t signed in yet</Badge>}
                    {!grant.user.isActive && <Badge tone="neutral">Disabled</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">Nobody yet. Invite someone, or approve an access request.</p>}
        </section>

        {company.mergedFrom.length > 0 && (
          <p className="text-sm text-muted lg:col-span-2">
            Includes the records of {company.mergedFrom.length === 1 ? "a duplicate" : "duplicates"} merged into this customer: {company.mergedFrom.map((duplicate, index) => (
              <span key={duplicate.id}>{index > 0 && ", "}<Link className="font-bold text-ink hover:text-brand" href={`/workspace/customers/${duplicate.id}`}>{duplicate.name}</Link></span>
            ))}.
          </p>
        )}
      </div>
    </main>
  );
}
