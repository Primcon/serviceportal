import Link from "next/link";
import { BarChart3, CalendarClock, CheckCircle2, ClipboardList, Hourglass, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { panelStyles } from "@/components/ui/styles";
import { BarList, WeeklyColumns } from "@/features/dashboard/charts";
import { operationsDashboard } from "@/features/dashboard/queries";
import { managerRoles } from "@/features/navigation/workspace-items";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

function Panel({ title, description, children, className = "" }: { title: string; description: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${panelStyles} ${className}`}>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function DashboardPage() {
  await requireWorkspaceUser(managerRoles);
  const { totals, byStage, aging, weekly, workload } = await operationsDashboard();
  const tiles = [
    { label: "Open jobs", value: totals.open, href: "/workspace/work-orders?open=1", icon: <ClipboardList size={18} /> },
    { label: "Past the promised date", value: totals.overdue, href: "/workspace/work-orders?overdue=1", icon: <CalendarClock size={18} />, danger: totals.overdue > 0 },
    { label: "Waiting on parts or customer", value: totals.waiting, href: "/workspace/board", icon: <Hourglass size={18} /> },
    { label: "Completed this week", value: totals.completedThisWeek, href: "/workspace/work-orders?status=COMPLETED", icon: <CheckCircle2 size={18} /> },
    { label: "Typical days to complete", value: totals.medianTurnaroundDays ?? "—", note: totals.completedLast30Days ? `Median of ${totals.completedLast30Days} job${totals.completedLast30Days === 1 ? "" : "s"} completed in the last 30 days` : "No jobs completed in the last 30 days", icon: <Timer size={18} /> },
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <PageHeader
        description="Where the work is, how long it's been there, and who has it. Counts are live."
        eyebrow="SERVICE"
        icon={<BarChart3 size={16} />}
        title="Operations"
      />

      <section aria-label="Summary" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => {
          const content = (
            <>
              <span className={tile.danger ? "text-danger" : "text-muted"}>{tile.icon}</span>
              <p className={`mt-3 text-3xl font-bold tabular-nums ${tile.danger ? "text-danger" : ""}`}>{tile.value}</p>
              <p className="mt-1 text-sm text-muted">{tile.label}</p>
              {tile.note && <p className="mt-1 text-xs text-subtle">{tile.note}</p>}
            </>
          );
          return tile.href
            ? <Link className="border-l-4 border-line bg-paper p-5 hover:border-brand" href={tile.href} key={tile.label}>{content}</Link>
            : <div className="border-l-4 border-line bg-paper p-5" key={tile.label}>{content}</div>;
        })}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-6">
          <Panel description="Open jobs in each stage. The note is how long jobs have typically been sitting there." title="Work by stage">
            {totals.open
              ? <BarList rows={byStage.map((stage) => ({ key: stage.id, label: stage.name, value: stage.count, href: stage.count ? `/workspace/work-orders?stage=${stage.id}&open=1` : undefined, note: stage.medianDays === null ? undefined : `${stage.medianDays}d typical` }))} unit="open jobs" />
              : <p className="text-sm text-muted">No open jobs.</p>}
          </Panel>
        </div>
        <div className="grid gap-6">
          <Panel description="Jobs opened and completed in each of the last eight weeks. The last column is this week so far." title="Weekly throughput">
            <WeeklyColumns weeks={weekly} />
          </Panel>
          <Panel description="Open jobs with each person. The note counts those past their promised date." title="Workload">
            {workload.length
              ? <BarList rows={workload.map((person) => ({ key: person.id ?? "queue", label: person.name, value: person.count, href: `/workspace/work-orders?assignee=${person.id ?? "none"}&open=1`, note: person.overdue ? <span className="font-bold text-danger">{person.overdue} overdue</span> : undefined }))} unit="open jobs" />
              : <p className="text-sm text-muted">No open jobs.</p>}
          </Panel>
          <Panel description="Open jobs by how long ago the pump was received." title="Age of open jobs">
            {totals.open ? <BarList rows={aging.map((bucket) => ({ key: bucket.label, label: bucket.label, value: bucket.count }))} unit="open jobs" /> : <p className="text-sm text-muted">No open jobs.</p>}
          </Panel>
        </div>
      </div>
    </main>
  );
}
