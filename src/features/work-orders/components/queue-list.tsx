import Link from "next/link";
import { CalendarClock, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isOverdue, wholeDaysSince, type QueueWorkOrder } from "@/features/work-orders/queue";
import { formatEnumLabel, isElevatedPriority } from "@/lib/labels";

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function daysLabel(days: number) {
  return days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`;
}

/** The badges that say why a job needs attention: rush priority, a holding condition, or a missed promise date. */
export function QueueBadges({ workOrder }: { workOrder: QueueWorkOrder }) {
  return (
    <>
      {isOverdue(workOrder.promisedAt) && <Badge tone="danger">Overdue</Badge>}
      {isElevatedPriority(workOrder.priority) && <Badge tone="brand">{workOrder.priority}</Badge>}
      {workOrder.condition !== "NORMAL" && <Badge tone="outline">{formatEnumLabel(workOrder.condition)}</Badge>}
    </>
  );
}

/** Rows of open work orders for a queue: what it is, where it is, how long it's been there and who has it. */
export function QueueList({ workOrders, viewerId, showStage = true }: { workOrders: QueueWorkOrder[]; viewerId: string; showStage?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {workOrders.map((workOrder) => {
        const days = wholeDaysSince(workOrder.stageEnteredAt);
        return (
          <li key={workOrder.id}>
            <Link className="group grid gap-2 px-5 py-4 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/workspace/work-orders/${workOrder.id}`}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-brand">{workOrder.workOrderNumber}</span><QueueBadges workOrder={workOrder} /></p>
                <p className="mt-1 truncate font-bold group-hover:text-brand">{workOrder.summary}</p>
                <p className="mt-0.5 truncate text-sm text-muted">{workOrder.company.name} · {workOrder.equipment.productModel} · Serial {workOrder.equipment.serialNumber}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm sm:justify-end sm:text-right">
                {showStage && <p><span className="block font-bold">{workOrder.serviceStage.displayName}</span><span className="block text-xs text-muted">{daysLabel(days)} in stage</span></p>}
                {!showStage && <p className="text-xs text-muted">{daysLabel(days)} in stage</p>}
                <p className="flex items-center gap-1.5 text-muted"><UserRound size={14} />{workOrder.assignedTo ? (workOrder.assignedTo.id === viewerId ? "You" : workOrder.assignedTo.displayName) : "Queue"}</p>
                {workOrder.promisedAt && <p className={`flex items-center gap-1.5 ${isOverdue(workOrder.promisedAt) ? "font-bold text-danger" : "text-muted"}`}><CalendarClock size={14} />{shortDate.format(workOrder.promisedAt)}</p>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
