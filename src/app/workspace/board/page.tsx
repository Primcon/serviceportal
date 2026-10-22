import Link from "next/link";
import { UserRole } from "@prisma/client";
import { KanbanSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/styles";
import { assignableStaff } from "@/features/assignments/assign";
import { StageBoard, type BoardColumn, type BoardJob } from "@/features/work-orders/components/stage-board";
import { isOverdue, openWorkOrders, wholeDaysSince, type QueueWorkOrder } from "@/features/work-orders/queue";
import { formatEnumLabel, isElevatedPriority } from "@/lib/labels";
import { firstParam, type SearchParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

/** More open jobs than this and the board stops being readable; the work order list has filters for that. */
const boardLimit = 400;
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function boardJob(workOrder: QueueWorkOrder, viewerId: string): BoardJob {
  return {
    id: workOrder.id,
    number: workOrder.workOrderNumber,
    summary: workOrder.summary,
    company: workOrder.company.name,
    model: workOrder.equipment.productModel,
    stageId: workOrder.serviceStage.id,
    condition: workOrder.condition,
    conditionLabel: workOrder.condition === "NORMAL" ? null : formatEnumLabel(workOrder.condition),
    priority: isElevatedPriority(workOrder.priority) ? workOrder.priority : null,
    overdue: isOverdue(workOrder.promisedAt),
    assigneeId: workOrder.assignedTo?.id ?? null,
    assignee: workOrder.assignedTo ? (workOrder.assignedTo.id === viewerId ? "You" : workOrder.assignedTo.displayName) : "Queue",
    days: wholeDaysSince(workOrder.stageEnteredAt),
    promised: workOrder.promisedAt ? shortDate.format(workOrder.promisedAt) : null,
  };
}

export default async function StageBoardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireWorkspaceUser();
  const view = firstParam((await searchParams).view);
  const filter = view === "mine" ? { assignedToId: viewer.id } : view === "queue" ? { assignedToId: null } : {};
  const [stages, workOrders, staff] = await Promise.all([
    prisma.serviceStage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" }, select: { id: true, displayName: true } }),
    openWorkOrders(filter, boardLimit),
    assignableStaff(),
  ]);
  const byStage = new Map<string, BoardJob[]>();
  for (const workOrder of workOrders) byStage.set(workOrder.serviceStage.id, [...(byStage.get(workOrder.serviceStage.id) ?? []), boardJob(workOrder, viewer.id)]);
  // Jobs sitting in a stage that was later retired still show, after the active stages. Nothing can be moved into it.
  const retired = workOrders.filter((workOrder) => !stages.some((stage) => stage.id === workOrder.serviceStage.id)).map((workOrder) => boardJob(workOrder, viewer.id));
  const columns: BoardColumn[] = [
    ...stages.map((stage) => ({ id: stage.id, name: stage.displayName, canDrop: true, jobs: byStage.get(stage.id) ?? [] })),
    ...(retired.length ? [{ id: "retired", name: "Retired stages", canDrop: false, jobs: retired }] : []),
  ];
  const views = [["", "Everyone's"], ["mine", "Mine"], ["queue", "Unassigned"]] as const;
  const isManager = viewer.internalRole === UserRole.PORTAL_ADMINISTRATOR || viewer.internalRole === UserRole.VACTECH_MANAGER;

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
        description="Every open job by stage, longest-waiting first. Drag a card to another stage, or use its arrow button, to move it. Red dates are past the promised date."
        eyebrow="SERVICE"
        icon={<KanbanSquare size={16} />}
        title="Stage board"
      />

      {workOrders.length ? (
        <>
          <StageBoard columns={columns} isManager={isManager} staff={staff.map((person) => ({ id: person.id, name: person.displayName }))} stages={stages.map((stage) => ({ id: stage.id, name: stage.displayName }))} viewerId={viewer.id} />
          {workOrders.length === boardLimit && <p className="mt-4 text-sm text-muted">Showing the first {boardLimit} open jobs. Use the work order list to filter further.</p>}
        </>
      ) : (
        <div className="mt-6"><EmptyState description={view ? "Switch to Everyone's to see all open jobs." : "Open work orders appear here by stage."} icon={<KanbanSquare size={24} />} title="No open jobs to show." /></div>
      )}
    </main>
  );
}
