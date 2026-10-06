import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, ListChecks, Lock, ShieldCheck } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles, panelStyles } from "@/components/ui/styles";
import { AddStepButton, EditTemplateButton, NewRevisionButton, StepTools } from "@/features/checklists/components/template-tools";
import { activateChecklistTemplate } from "@/features/checklists/template-actions";
import { managerRoles } from "@/features/navigation/workspace-items";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

export default async function ChecklistTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  await requireWorkspaceUser(managerRoles);
  const { templateId } = await params;
  const [template, stages] = await Promise.all([
    prisma.checklistTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        formNumber: true,
        revision: true,
        name: true,
        isActive: true,
        steps: { orderBy: [{ serviceStage: { sequence: "asc" } }, { sequence: "asc" }], select: { id: true, serviceStageId: true, label: true, type: true, unit: true, items: true, requiresQa: true, isRequired: true, serviceStage: { select: { displayName: true } } } },
        _count: { select: { workOrders: true } },
      },
    }).catch(() => null),
    prisma.serviceStage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" }, select: { id: true, displayName: true } }),
  ]);
  if (!template) notFound();

  const isLocked = template._count.workOrders > 0;
  const groups: { stageId: string; stageName: string; steps: typeof template.steps }[] = [];
  for (const step of template.steps) {
    const group = groups.at(-1)?.stageId === step.serviceStageId ? groups.at(-1)! : groups[groups.push({ stageId: step.serviceStageId, stageName: step.serviceStage.displayName, steps: [] }) - 1];
    group.steps.push(step);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link className="flex w-fit items-center gap-2 text-sm font-bold text-brand" href="/workspace/checklists"><ArrowLeft size={16} /> Checklists</Link>
      <div className="mt-5">
        <PageHeader
          actions={(
            <>
              {!isLocked && <EditTemplateButton template={{ id: template.id, formNumber: template.formNumber, revision: template.revision, name: template.name }} />}
              <NewRevisionButton formNumber={template.formNumber} revision={template.revision} templateId={template.id} />
              {!template.isActive && (
                <ActionFeedbackForm action={activateChecklistTemplate} className="flex flex-wrap items-center gap-2" feedbackClassName="max-w-xs">
                  <input name="templateId" type="hidden" value={template.id} />
                  <button className={buttonStyles({ size: "sm" })}><CircleCheck size={15} /> Make active</button>
                </ActionFeedbackForm>
              )}
            </>
          )}
          description={template.name}
          eyebrow="CHECKLIST"
          icon={<ListChecks size={16} />}
          title={`Form ${template.formNumber} Rev. ${template.revision}`}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-l-4 border-line bg-paper px-4 py-3 text-sm">
        {template.isActive ? <Badge tone="success">Active: new work orders use this revision</Badge> : <Badge tone="outline">Not active</Badge>}
        <span className="text-muted">{template._count.workOrders} work order{template._count.workOrders === 1 ? "" : "s"} on this revision</span>
        {isLocked && <span className="flex items-center gap-1.5 text-muted"><Lock size={14} /> Locked, because work orders were done under it. To change the steps, create a new revision.</span>}
      </div>

      <section className={`${panelStyles} mt-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Steps <span className="font-normal text-muted">({template.steps.length})</span></h2>
          {!isLocked && <AddStepButton stages={stages} templateId={template.id} />}
        </div>
        {groups.length ? (
          <div className="mt-4 grid gap-5">
            {groups.map((group) => (
              <section aria-label={group.stageName} key={group.stageId}>
                <h3 className="border-b-2 border-line pb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted">{group.stageName}</h3>
                <ul className="divide-y divide-line">
                  {group.steps.map((step, index) => (
                    <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={step.id}>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-bold">
                          {step.label}
                          {step.requiresQa && <Badge tone="outline"><ShieldCheck className="mr-1" size={12} />QA</Badge>}
                          {!step.isRequired && <span className="text-xs font-normal text-muted">Optional</span>}
                        </p>
                        <p className="mt-0.5 text-sm text-muted">
                          {step.type === "SIGN_OFF" && "Sign-off"}
                          {step.type === "READING" && `Reading${step.unit ? ` in ${step.unit}` : ""}`}
                          {step.type === "CHECKLIST" && `Each done or N/A: ${step.items.join(", ")}`}
                        </p>
                      </div>
                      {!isLocked && <StepTools isFirst={index === 0} isLast={index === group.steps.length - 1} stages={stages} step={{ id: step.id, serviceStageId: step.serviceStageId, label: step.label, type: step.type, unit: step.unit, items: step.items, requiresQa: step.requiresQa, isRequired: step.isRequired }} templateId={template.id} />}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted">No steps yet. Add the first one.</p>}
      </section>
    </main>
  );
}
