import Link from "next/link";
import { ArrowRight, ScrollText, Search, ShieldAlert } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { assignableStaff } from "@/features/assignments/assign";
import { auditCategories, describeDetails, eventTitle, type AuditCategory } from "@/features/audit/describe";
import { listAuditEvents } from "@/features/audit/queries";
import { managerRoles } from "@/features/navigation/workspace-items";
import { shopTimeZone } from "@/lib/dates";
import { firstParam, pageFromParams, type SearchParams } from "@/lib/pagination";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: shopTimeZone });

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser(managerRoles);
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const categoryParam = firstParam(params.category) ?? "";
  const category = categoryParam in auditCategories ? categoryParam as AuditCategory : undefined;
  const actorId = z.string().uuid().safeParse(firstParam(params.actor)).data;
  const from = firstParam(params.from) ?? "";
  const to = firstParam(params.to) ?? "";
  const overridesOnly = firstParam(params.overrides) === "1";

  const [{ events, total, page, pageSize }, staff] = await Promise.all([
    listAuditEvents({ search, category, actorId, from, to, overridesOnly, page: pageFromParams(params) }),
    assignableStaff(),
  ]);
  const filtersApplied = Boolean(search || category || actorId || from || to || overridesOnly);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader
        description="Who changed what, and when: every sign-off, override, edit, upload, merge and access change. Times are in the shop's time zone."
        eyebrow="ADMINISTRATION"
        icon={<ScrollText size={16} />}
        title="Audit log"
      />

      <form className="mt-6 grid gap-3 border border-line bg-paper p-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]" method="get">
        <label className="sr-only" htmlFor="audit-search">Search</label>
        <div className="relative"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className={`${fieldStyles} pl-10`} defaultValue={search} id="audit-search" name="search" placeholder="WIP number, person, or event" /></div>
        <label className="sr-only" htmlFor="audit-category">Kind of activity</label>
        <select className={fieldStyles} defaultValue={category ?? ""} id="audit-category" name="category">
          <option value="">All activity</option>
          {(Object.keys(auditCategories) as AuditCategory[]).map((key) => <option key={key} value={key}>{auditCategories[key].label}</option>)}
        </select>
        <label className="sr-only" htmlFor="audit-actor">Person</label>
        <select className={fieldStyles} defaultValue={actorId ?? ""} id="audit-actor" name="actor">
          <option value="">Anyone</option>
          {staff.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">From <input aria-label="From date" className={fieldStyles} defaultValue={from} name="from" type="date" /></label>
        <label className="flex items-center gap-2 text-sm text-muted">To <input aria-label="To date" className={fieldStyles} defaultValue={to} name="to" type="date" /></label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-5">
          <label className="flex items-center gap-2 text-sm text-muted"><input className="size-4 accent-brand" defaultChecked={overridesOnly} name="overrides" type="checkbox" value="1" /> Manager overrides only</label>
          <button className={buttonStyles({ size: "sm" })}>Apply filters</button>
          {filtersApplied && <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/workspace/audit">Reset</Link>}
          <p className="ml-auto text-sm font-bold text-muted">{total} event{total === 1 ? "" : "s"}</p>
        </div>
      </form>

      <section className="mt-6 border-y border-line bg-paper">
        {events.length ? (
          <ul className="divide-y divide-line">
            {events.map((event) => {
              const details = describeDetails(event.metadata);
              const isOverride = event.eventType === "checklist.overridden";
              return (
                <li className="grid gap-x-6 gap-y-1 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]" key={event.id}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {isOverride && <ShieldAlert className="text-danger" size={16} />}
                      {eventTitle(event.eventType)}
                      {event.customerVisible && <Badge tone="brand">Customer can see</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {event.actorUser?.displayName ?? "System"}
                      {event.workOrder && <> · <Link className="font-bold text-ink hover:text-brand" href={`/workspace/work-orders/${event.workOrder.id}`}>{event.workOrder.workOrderNumber}</Link> <span className="hidden sm:inline">{event.workOrder.summary}</span></>}
                    </p>
                    {details.length > 0 && (
                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
                        {details.map((detail) => (
                          <div className="contents" key={detail.label}>
                            <dt className="text-muted">{detail.label}</dt>
                            <dd className="min-w-0 break-words">
                              {"from" in detail
                                ? <><span className="text-muted line-through decoration-subtle">{detail.from}</span> <ArrowRight aria-label="changed to" className="mx-1 inline text-muted" size={13} /> <span className="font-bold">{detail.to}</span></>
                                : detail.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  <time className="whitespace-nowrap text-xs text-muted" dateTime={event.createdAt.toISOString()}>{when.format(event.createdAt)}</time>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5"><EmptyState description={filtersApplied ? "Change or clear the filters." : "Activity appears here as the portal is used."} icon={<ScrollText size={24} />} title={filtersApplied ? "No activity matches these filters." : "No activity yet."} /></div>
        )}
        <Pagination label="events" page={page} pageSize={pageSize} params={params} pathname="/workspace/audit" total={total} />
      </section>
    </main>
  );
}
