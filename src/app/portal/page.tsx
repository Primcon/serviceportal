import Link from "next/link";
import { CustomerFacingStatus } from "@prisma/client";
import { AlertCircle, ArrowUpRight, ClipboardList, Search } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { customerConditionNotices, customerStageLabel, progressSteps } from "@/features/customer/progress";
import { countCustomerWorkOrdersByStatus, customerProgressStages, listCustomerCompanies, listCustomerWorkOrders } from "@/features/work-orders/customer-queries";
import { shopTimeZone } from "@/lib/dates";
import { customerStatusLabels } from "@/lib/labels";
import { firstParam, pageFromParams, type SearchParams } from "@/lib/pagination";
import { getRequestActor } from "@/services/request-actor";

export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: shopTimeZone });
const calendarDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function CustomerPortalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const status = firstParam(params.status) ?? "";
  const customerStatus = Object.values(CustomerFacingStatus).includes(status as CustomerFacingStatus) ? status as CustomerFacingStatus : undefined;
  const companyId = z.string().uuid().safeParse(firstParam(params.company)).data;
  const actor = await getRequestActor("customer");
  const [{ workOrders, total, page, pageSize }, counts, companies, stages] = actor
    ? await Promise.all([
      listCustomerWorkOrders(actor.identitySubject, { search, status, companyId, page: pageFromParams(params) }),
      countCustomerWorkOrdersByStatus(actor.identitySubject),
      listCustomerCompanies(actor.identitySubject),
      customerProgressStages(),
    ])
    : [{ workOrders: [], total: 0, page: 1, pageSize: 20 }, new Map<CustomerFacingStatus, number>(), [], []];
  const filtersApplied = Boolean(search || customerStatus || companyId);
  const showCompany = companies.length > 1;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader description="Follow each repair from arrival to shipping, with updates, photos and documents from your service team." eyebrow="MY REPAIRS" title="Your repairs" />

      <section aria-label="Repairs by status" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.values(CustomerFacingStatus).map((item) => (
          <Link aria-current={customerStatus === item ? "true" : undefined} className={`border-l-4 bg-paper p-5 hover:border-brand ${customerStatus === item ? "border-brand" : "border-line"}`} href={customerStatus === item ? "/portal" : `/portal?status=${item}`} key={item}>
            <p className="text-3xl font-bold tabular-nums">{counts.get(item) ?? 0}</p>
            <p className="mt-1 text-sm text-muted">{customerStatusLabels[item]}</p>
          </Link>
        ))}
      </section>

      <form className={`mt-6 grid gap-3 ${showCompany ? "sm:grid-cols-[minmax(0,1fr)_200px_220px_auto]" : "sm:grid-cols-[minmax(0,1fr)_200px_auto]"}`} key={`${search}:${customerStatus ?? ""}:${companyId ?? ""}`} method="get" role="search">
        <label className="sr-only" htmlFor="portal-search">Search repairs</label>
        <div className="relative"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className={`${fieldStyles} pl-10`} defaultValue={search} id="portal-search" name="search" placeholder="Repair number, PO, model or serial" /></div>
        <label className="sr-only" htmlFor="portal-status">Status</label>
        <select className={fieldStyles} defaultValue={customerStatus ?? ""} id="portal-status" name="status"><option value="">All statuses</option>{Object.values(CustomerFacingStatus).map((item) => <option key={item} value={item}>{customerStatusLabels[item]}</option>)}</select>
        {showCompany && (
          <>
            <label className="sr-only" htmlFor="portal-company">Company</label>
            <select className={fieldStyles} defaultValue={companyId ?? ""} id="portal-company" name="company"><option value="">All my companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
          </>
        )}
        <div className="flex gap-2">
          <button className={buttonStyles({ size: "sm" })}>Search</button>
          {filtersApplied && <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/portal">Reset</Link>}
        </div>
      </form>

      <section className="mt-5 border-y border-line bg-paper">
        {workOrders.length ? workOrders.map((workOrder) => {
          const steps = progressSteps(stages, workOrder.serviceStage.sequence);
          const stepNumber = steps.findIndex((step) => step.state === "current") + 1;
          const notice = customerConditionNotices[workOrder.condition];
          const isDone = workOrder.customerFacingStatus === "COMPLETED" || workOrder.condition === "CANCELLED";
          return (
            <Link className="group grid gap-3 border-b border-line px-5 py-5 last:border-b-0 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto] sm:items-center" href={`/portal/work-orders/${workOrder.id}`} key={workOrder.id}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-brand">{workOrder.workOrderNumber}</span>
                  <Badge tone={workOrder.customerFacingStatus === "COMPLETED" ? "success" : "brand"}>{workOrder.condition === "CANCELLED" ? "Cancelled" : customerStatusLabels[workOrder.customerFacingStatus]}</Badge>
                  {notice && workOrder.condition !== "CANCELLED" && <span className="flex items-center gap-1 text-xs font-bold text-danger"><AlertCircle size={13} /> {notice.title}</span>}
                </p>
                <h2 className="mt-1.5 text-lg font-bold group-hover:text-brand">{workOrder.summary}</h2>
                <p className="mt-1 text-sm text-muted">{workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}{showCompany && ` · ${workOrder.company.name}`}</p>
                {workOrder.updates[0] && <p className="mt-2 truncate border-l-2 border-line pl-3 text-sm text-body"><span className="font-bold">{day.format(workOrder.updates[0].createdAt)}:</span> {workOrder.updates[0].title}</p>}
              </div>
              <div className="text-sm">
                <p className="font-bold">{customerStageLabel(workOrder.serviceStage)}</p>
                {!isDone && stepNumber > 0 && (
                  <>
                    <div aria-hidden className="mt-1.5 flex gap-1">{steps.map((step) => <span className={`h-1.5 flex-1 ${step.state === "upcoming" ? "bg-line" : step.state === "current" ? "bg-brand" : "bg-ink"}`} key={step.label} />)}</div>
                    <p className="mt-1.5 text-xs text-muted">Step {stepNumber} of {steps.length}{workOrder.promisedAt && ` · Expected by ${calendarDay.format(workOrder.promisedAt)}`}</p>
                  </>
                )}
              </div>
              <ArrowUpRight className="hidden text-brand sm:block" size={18} />
            </Link>
          );
        }) : (
          <div className="p-5">
            <EmptyState
              description={filtersApplied ? "Change or clear the search to see more." : "When your equipment arrives at the service center, its repair appears here."}
              icon={<ClipboardList size={24} />}
              title={filtersApplied ? "No repairs match this search." : "No repairs yet."}
            />
          </div>
        )}
        <Pagination label="repairs" page={page} pageSize={pageSize} params={params} pathname="/portal" total={total} />
      </section>
    </main>
  );
}
