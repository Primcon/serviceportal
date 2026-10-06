import Link from "next/link";
import { CalendarClock, ClipboardList, Hand, Hourglass, Inbox, KanbanSquare, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/styles";
import { QueueList } from "@/features/work-orders/components/queue-list";
import { canApproveWarranty, pendingWarrantyClaims } from "@/features/warranty/queries";
import { openWorkOrders, queueCounts } from "@/features/work-orders/queue";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

const queuePreview = 15;

function QueueSection({ title, description, count, href, children }: { title: string; description: string; count: number; href: string; children: ReactNode }) {
  return (
    <section className="border-y border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div><h2 className="font-bold">{title} <span className="font-normal text-muted">({count})</span></h2><p className="mt-0.5 text-sm text-muted">{description}</p></div>
        {count > queuePreview && <Link className="text-sm font-bold text-brand" href={href}>See all {count}</Link>}
      </div>
      {children}
    </section>
  );
}

export default async function WorkspacePage() {
  const viewer = await requireWorkspaceUser();
  const [counts, mine, unassigned] = await Promise.all([
    queueCounts(viewer.id),
    openWorkOrders({ assignedToId: viewer.id }, queuePreview),
    openWorkOrders({ assignedToId: null }, queuePreview),
  ]);
  // Only the named warranty approvers are shown claims to decide.
  const claims = (await canApproveWarranty(viewer.id)) ? await pendingWarrantyClaims() : [];
  const tiles = [
    { label: "With me", value: counts.mine, href: "/workspace/work-orders?assignee=me&open=1", icon: <Hand size={18} />, accent: true },
    { label: "Waiting in the queue", value: counts.unassigned, href: "/workspace/work-orders?assignee=none&open=1", icon: <Inbox size={18} /> },
    { label: "Past the promised date", value: counts.overdue, href: "/workspace/work-orders?overdue=1", icon: <CalendarClock size={18} />, danger: counts.overdue > 0 },
    { label: "Waiting on parts or customer", value: counts.waiting, href: "/workspace/board", icon: <Hourglass size={18} /> },
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <PageHeader
        actions={(
          <>
            <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/workspace/board"><KanbanSquare size={16} /> Stage board</Link>
            <Link className={buttonStyles({ size: "sm" })} href="/workspace/work-orders/new"><ClipboardList size={16} /> New work order</Link>
          </>
        )}
        description="The jobs that are with you, and the ones waiting for someone to pick them up."
        eyebrow="SERVICE"
        title="My work"
      />

      <section aria-label="Queue summary" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Link className={`group border-l-4 bg-paper p-5 hover:border-brand ${tile.accent ? "border-brand" : "border-line"}`} href={tile.href} key={tile.label}>
            <span className={tile.danger ? "text-danger" : "text-muted group-hover:text-brand"}>{tile.icon}</span>
            <p className={`mt-3 text-3xl font-bold tabular-nums ${tile.danger ? "text-danger" : ""}`}>{tile.value}</p>
            <p className="mt-1 text-sm text-muted">{tile.label}</p>
          </Link>
        ))}
      </section>

      <div className="mt-8 grid gap-6">
        {claims.length > 0 && (
          <section className="border-y border-line border-l-4 border-l-brand bg-paper">
            <div className="border-b border-line px-5 py-4"><h2 className="flex items-center gap-2 font-bold"><ShieldAlert className="text-brand" size={18} /> Warranty claims to decide <span className="font-normal text-muted">({claims.length})</span></h2><p className="mt-0.5 text-sm text-muted">Open a job to approve or deny its claim.</p></div>
            <ul className="divide-y divide-line">
              {claims.map((claim) => (
                <li key={claim.id}>
                  <Link className="group flex flex-wrap items-center justify-between gap-3 px-5 py-3" href={`/workspace/work-orders/${claim.id}#warranty`}>
                    <span className="min-w-0"><span className="block font-bold group-hover:text-brand">{claim.workOrderNumber} · {claim.summary}</span><span className="block text-sm text-muted">{claim.company.name} · {claim.equipment.productModel} · Serial {claim.equipment.serialNumber}</span></span>
                    {claim.warrantyClaimOn && <span className="text-sm text-muted">Against WIP {claim.warrantyClaimOn.workOrderNumber}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <QueueSection count={counts.mine} description="Open jobs handed to you or taken by you." href="/workspace/work-orders?assignee=me&open=1" title="With me">
          {mine.length
            ? <QueueList viewerId={viewer.id} workOrders={mine} />
            : <div className="p-5"><EmptyState description="Take a job from the queue below, or open a new work order." icon={<Hand size={24} />} title="Nothing is with you right now." /></div>}
        </QueueSection>

        <QueueSection count={counts.unassigned} description="Open jobs nobody has yet, earliest stage first. Open one and choose Take it." href="/workspace/work-orders?assignee=none&open=1" title="Waiting in the queue">
          {unassigned.length
            ? <QueueList viewerId={viewer.id} workOrders={unassigned} />
            : <div className="p-5"><EmptyState description="Every open job has an owner." icon={<Inbox size={24} />} title="The queue is empty." /></div>}
        </QueueSection>
      </div>
    </main>
  );
}
