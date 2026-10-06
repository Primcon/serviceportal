import Link from "next/link";
import { ArrowUpRight, ListChecks } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/styles";
import { createStartingChecklist } from "@/features/checklists/template-actions";
import { managerRoles } from "@/features/navigation/workspace-items";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";
import { shopTimeZone } from "@/lib/dates";

export const dynamic = "force-dynamic";

const dateOnly = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: shopTimeZone });

export default async function ChecklistsPage() {
  await requireWorkspaceUser(managerRoles);
  const templates = await prisma.checklistTemplate.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: { id: true, formNumber: true, revision: true, name: true, isActive: true, createdAt: true, _count: { select: { steps: true, workOrders: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <PageHeader
        description="The steps technicians and QA sign on each job, kept as numbered revisions of the job order form. New work orders use the active revision; jobs already open stay on the one they started with."
        eyebrow="ADMINISTRATION"
        icon={<ListChecks size={16} />}
        title="Checklists"
      />
      <section className="mt-6 border-y border-line bg-paper">
        {templates.length ? templates.map((template) => (
          <Link className="group grid gap-2 border-b border-line px-5 py-4 last:border-b-0 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/workspace/checklists/${template.id}`} key={template.id}>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-bold group-hover:text-brand">
                Form {template.formNumber} Rev. {template.revision}
                {template.isActive ? <Badge tone="success">Active</Badge> : template._count.workOrders ? <Badge tone="neutral">Earlier revision</Badge> : <Badge tone="outline">Draft</Badge>}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted">{template.name} · Created {dateOnly.format(template.createdAt)}</p>
            </div>
            <p className="flex items-center gap-4 text-sm text-muted">
              <span>{template._count.steps} step{template._count.steps === 1 ? "" : "s"}</span>
              <span>{template._count.workOrders} work order{template._count.workOrders === 1 ? "" : "s"}</span>
              <ArrowUpRight className="text-brand" size={16} />
            </p>
          </Link>
        )) : (
          <div className="p-5">
            <EmptyState
              action={<ActionFeedbackForm action={createStartingChecklist} className="grid justify-items-center gap-2"><button className={buttonStyles({ size: "sm" })}><ListChecks size={15} /> Create the starting checklist</button></ActionFeedbackForm>}
              description="Start from the steps of job order form 852-01-01 Rev. 9, then adjust them before any work order uses it."
              icon={<ListChecks size={24} />}
              title="No checklist yet."
            />
          </div>
        )}
      </section>
    </main>
  );
}
