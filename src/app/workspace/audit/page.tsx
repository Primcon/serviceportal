import Link from "next/link";
import { Activity, Search } from "lucide-react";
import { listInternalAuditEvents } from "@/features/work-orders/internal-queries";
import { requireWorkspaceUser } from "@/services/page-access";
import { managerRoles } from "@/features/navigation/workspace-items";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser(managerRoles);
  const resolvedSearchParams = await searchParams;
  const search = firstParam(resolvedSearchParams.search) ?? "";
  const requestedPage = Number(firstParam(resolvedSearchParams.page) ?? "1");
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const { events, total, pageSize } = await listInternalAuditEvents(search, page);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const auditHref = (targetPage: number) => `/workspace/audit?${new URLSearchParams({ ...(search ? { search } : {}), page: String(targetPage) })}`;

  return (
    <main className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-7"><div><div className="flex items-center gap-2 text-sm font-bold tracking-[0.1em] text-brand"><Activity size={17} /> AUDIT REVIEW</div><h1 className="mt-2 text-3xl font-bold">System activity</h1><p className="mt-2 text-muted">Review important administrative and service-record changes.</p></div><p className="text-sm text-muted">{total} event{total === 1 ? "" : "s"}</p></div><form method="get" className="mt-6 flex max-w-2xl gap-2"><label className="sr-only" htmlFor="audit-search">Search activity</label><div className="relative flex-1"><Search className="absolute left-3 top-3 text-muted" size={17} /><input id="audit-search" className="w-full border border-line bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand" name="search" defaultValue={search} placeholder="Search event, entity, ID, or actor" /></div><button className="bg-brand px-4 py-2.5 text-sm font-bold text-white">Search activity</button></form><section className="mt-6 border-y border-line bg-paper">{events.length ? <div className="divide-y divide-line">{events.map((event) => <article className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto]" key={event.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{event.eventType.replace(".", " - ")}</p>{event.customerVisible && <span className="bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">Customer visible</span>}</div><p className="mt-1 text-sm text-muted">{event.entityType}{event.entityId ? ` · ${event.entityId}` : ""} · {event.actorUser?.displayName ?? "System"}</p>{event.workOrder && <p className="mt-1 text-sm text-body">{event.workOrder.workOrderNumber} · {event.workOrder.summary}</p>}</div><time className="text-xs text-muted">{formatDate(event.createdAt)}</time></article>)}</div> : <p className="px-5 py-10 text-sm text-muted">No activity matches this search.</p>}</section>{total > pageSize && <nav className="mt-5 flex items-center justify-between gap-4" aria-label="Audit event pages"><Link aria-disabled={currentPage === 1} className={currentPage === 1 ? "pointer-events-none border border-line px-3 py-2 text-sm text-subtle" : "border border-brand px-3 py-2 text-sm font-bold text-brand hover:bg-brand hover:text-white"} href={auditHref(currentPage - 1)}>Previous</Link><p className="text-sm text-muted">Page {currentPage} of {pageCount}</p><Link aria-disabled={currentPage === pageCount} className={currentPage === pageCount ? "pointer-events-none border border-line px-3 py-2 text-sm text-subtle" : "border border-brand px-3 py-2 text-sm font-bold text-brand hover:bg-brand hover:text-white"} href={auditHref(currentPage + 1)}>Next</Link></nav>}</div>
    </main>
  );
}
