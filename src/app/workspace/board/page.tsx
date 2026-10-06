import Link from "next/link";
import { CalendarClock, KanbanSquare, UserRound } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/styles";
import { QueueBadges } from "@/features/work-orders/components/queue-list";
import { isOverdue, openWorkOrders, wholeDaysSince } from "@/features/work-orders/queue";
import { firstParam, type SearchParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

/** More open jobs than this and the board stops being readable; the work order list has filters for that. */
const boardLimit = 400;
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function StageBoardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireWorkspaceUser();
  const view = firstParam((await searchParams).view);
  const filter = view === "mine" ? { assignedToId: viewer.id } : view === "queue" ? { assignedToId: null } : {};
  const [stages, workOrders] = await Promise.all([
    prisma.serviceStage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" }, select: { id: true, displayName: true } }),
    openWorkOrders(filter, boardLimit),
  ]);
  const byStage = new Map<string, typeof workOrders>();
  for (const workOrder of workOrders) byStage.set(workOrder.serviceStage.id, [...(byStage.get(workOrder.serviceStage.id) ?? []), workOrder]);
  // Jobs sitting in a stage that was later retired still show, after the active stages.
  const retired = workOrders.filter((workOrder) => !stages.some((stage) => stage.id === workOrder.serviceStage.id));
  const columns = [...stages.map((stage) => ({ ...stage, jobs: byStage.get(stage.id) ?? [] })), ...(retired.length ? [{ id: "retired", displayName: "Retired stages", jobs: retired }] : [])];
  const views = [["", "Everyone's"], ["mine", "Mine"], ["queue", "Unassigned"]] as const;

  return (
    <main className="px-5 py-8 sm:px-8">
      <PageHeader
        actions={(
          <div aria-label="Whose jobs to show" className="flex" role="group">
            {views.map(([value, label]) => (
              <Link aria-current={(view ?? "") === value ? "true" : undefined} className={buttonStyles({ variant: (view ?? "") === value ? "secondary" : "outline", size: "sm", className: "-ml-px first:ml-0" })} href={value ? `/workspace/board?view=${value}` : "/workspace/board"} key={value}>{label}</Link>
            ))}
          </div>
        )}
        description="Every open job by stage, longest-waiting first. Red dates are past the promised date."
        eyebrow="SERVICE"
        icon={<KanbanSquare size={16} />}
        title="Stage board"
      />

      {workOrders.length ? (
        <div className="mt-6 overflow-x-auto pb-4">
          <div className="flex min-w-max items-start gap-3">
            {columns.map((column) => (
              <section aria-label={column.displayName} className="w-64 shrink-0 border border-line bg-surface" key={column.id}>
                <h2 className="flex items-center justify-between gap-2 border-b border-line bg-paper px-3 py-2.5 text-sm font-bold">{column.displayName}<span className="font-normal tabular-nums text-muted">{column.jobs.length}</span></h2>
                <ul className="grid gap-2 p-2">
                  {column.jobs.map((workOrder) => {
                    const days = wholeDaysSince(workOrder.stageEnteredAt);
                    return (
                      <li key={workOrder.id}>
                        <Link className="group block border border-line bg-paper p-3 hover:border-brand" href={`/workspace/work-orders/${workOrder.id}`}>
                          <p className="flex flex-wrap items-center gap-1.5"><span className="text-sm font-bold text-brand">{workOrder.workOrderNumber}</span><QueueBadges workOrder={workOrder} /></p>
                          <p className="mt-1 line-clamp-2 text-sm font-bold group-hover:text-brand">{workOrder.summary}</p>
                          <p className="mt-1 truncate text-xs text-muted">{workOrder.company.name}</p>
                          <p className="truncate text-xs text-muted">{workOrder.equipment.productModel}</p>
                          <p className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs text-muted">
                            <span className="flex items-center gap-1"><UserRound size={12} />{workOrder.assignedTo ? (workOrder.assignedTo.id === viewer.id ? "You" : workOrder.assignedTo.displayName) : "Queue"}</span>
                            <span className={days >= 7 ? "font-bold text-ink" : ""}>{days === 0 ? "Today" : `${days}d`}</span>
                            {workOrder.promisedAt && <span className={`flex items-center gap-1 ${isOverdue(workOrder.promisedAt) ? "font-bold text-danger" : ""}`}><CalendarClock size={12} />{shortDate.format(workOrder.promisedAt)}</span>}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                  {!column.jobs.length && <li className="px-2 py-4 text-center text-xs text-subtle">Empty</li>}
                </ul>
              </section>
            ))}
          </div>
          {workOrders.length === boardLimit && <p className="mt-4 text-sm text-muted">Showing the first {boardLimit} open jobs. Use the work order list to filter further.</p>}
        </div>
      ) : (
        <div className="mt-6"><EmptyState description={view ? "Switch to Everyone's to see all open jobs." : "Open work orders appear here by stage."} icon={<KanbanSquare size={24} />} title="No open jobs to show." /></div>
      )}
    </main>
  );
}
