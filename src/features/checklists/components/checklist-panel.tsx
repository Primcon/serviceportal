"use client";

import { useState } from "react";
import { Check, ShieldCheck, Undo2 } from "lucide-react";
import type { ChecklistStepType } from "@prisma/client";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Badge } from "@/components/ui/badge";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { clearChecklistStep, signChecklistStep } from "@/features/checklists/actions";

export type PanelStep = {
  id: string;
  label: string;
  type: ChecklistStepType;
  unit: string | null;
  items: string[];
  requiresQa: boolean;
  isRequired: boolean;
  stageId: string;
  stageName: string;
  record: { performedById: string; performedBy: string; initials: string; performedAt: string; notApplicable: boolean; reading: string | null; checkedItems: string[]; notApplicableItems: string[]; note: string | null } | null;
};

const signedOn = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function SignedStep({ step, workOrderId, canClear }: { step: PanelStep; workOrderId: string; canClear: boolean }) {
  const record = step.record!;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="grid h-7 min-w-7 place-items-center bg-ink px-1.5 font-mono text-xs font-bold text-white" title={record.performedBy}>{record.initials}</span>
          <span className="text-muted">{record.performedBy} · {signedOn.format(new Date(record.performedAt))}</span>
          {record.notApplicable && <Badge tone="neutral">Not applicable</Badge>}
        </p>
        {record.reading && <p className="mt-1.5 font-bold">{record.reading}{step.unit && <span className="font-normal text-muted"> {step.unit}</span>}</p>}
        {step.type === "CHECKLIST" && !record.notApplicable && (
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-muted">
            {step.items.map((item) => <li className="flex items-center gap-1" key={item}>{record.notApplicableItems.includes(item) ? <span className="text-xs font-bold">N/A</span> : <Check className="text-success" size={14} />}{item}</li>)}
          </ul>
        )}
        {record.note && <p className="mt-1.5 border-l-2 border-line pl-3 text-body">{record.note}</p>}
      </div>
      {canClear && (
        <ActionFeedbackForm action={clearChecklistStep} className="flex flex-wrap items-center gap-2">
          <input name="workOrderId" type="hidden" value={workOrderId} />
          <input name="stepId" type="hidden" value={step.id} />
          <button className={buttonStyles({ variant: "ghost", size: "sm" })}><Undo2 size={14} /> Clear</button>
        </ActionFeedbackForm>
      )}
    </div>
  );
}

function OpenStep({ step, workOrderId }: { step: PanelStep; workOrderId: string }) {
  const [notApplicable, setNotApplicable] = useState(false);
  return (
    <ActionFeedbackForm action={signChecklistStep} className="grid gap-2.5" key={String(notApplicable)}>
      <input name="workOrderId" type="hidden" value={workOrderId} />
      <input name="stepId" type="hidden" value={step.id} />
      <input name="notApplicable" type="hidden" value={String(notApplicable)} />
      {!notApplicable && step.type === "READING" && (
        <label className="flex max-w-xs items-center gap-2 text-sm">
          <span className="sr-only">{step.label} reading</span>
          <input aria-label={`${step.label} reading`} autoComplete="off" className={fieldStyles} inputMode="decimal" maxLength={60} name="reading" placeholder="Reading" />
          {step.unit && <span className="shrink-0 text-muted">{step.unit}</span>}
        </label>
      )}
      {!notApplicable && step.type === "CHECKLIST" && (
        <ul className="grid gap-1.5 text-sm">
          {step.items.map((item, index) => (
            <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line pb-1.5 last:border-b-0" key={item}>
              <span>{item}</span>
              <span className="flex gap-4" role="group" aria-label={item}>
                <label className="flex items-center gap-1.5"><input className="size-4 accent-brand" name={`item:${index}`} type="radio" value="done" /> Done</label>
                <label className="flex items-center gap-1.5 text-muted"><input className="size-4 accent-brand" name={`item:${index}`} type="radio" value="na" /> N/A</label>
              </span>
            </li>
          ))}
        </ul>
      )}
      {notApplicable && (
        <input aria-label={`Why ${step.label} doesn't apply`} autoFocus className={fieldStyles} maxLength={500} name="note" placeholder="Why doesn't this step apply to this job?" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button className={buttonStyles({ variant: notApplicable ? "outline" : "primary", size: "sm" })}>{notApplicable ? "Mark not applicable" : <><Check size={15} /> Sign</>}</button>
        <button className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => setNotApplicable(!notApplicable)} type="button">{notApplicable ? "Cancel" : "Doesn't apply"}</button>
      </div>
    </ActionFeedbackForm>
  );
}

/**
 * The job's checklist, grouped by the stage each step is done in. Signing a step records
 * the signed-in person and the time, in place of initials and a date on the paper form.
 */
export function ChecklistPanel({ workOrderId, steps, currentStageId, viewerId, canSignQa, isManager, isClosed }: {
  workOrderId: string;
  steps: PanelStep[];
  currentStageId: string;
  viewerId: string;
  canSignQa: boolean;
  isManager: boolean;
  isClosed: boolean;
}) {
  const groups: { stageId: string; stageName: string; steps: PanelStep[] }[] = [];
  for (const step of steps) {
    const group = groups.at(-1)?.stageId === step.stageId ? groups.at(-1)! : groups[groups.push({ stageId: step.stageId, stageName: step.stageName, steps: [] }) - 1];
    group.steps.push(step);
  }

  return (
    <div className="grid gap-5">
      {groups.map((group) => {
        const signed = group.steps.filter((step) => step.record).length;
        const isCurrent = group.stageId === currentStageId;
        return (
          <section aria-label={group.stageName} key={group.stageId}>
            <h3 className={`flex flex-wrap items-center justify-between gap-2 border-b-2 pb-1.5 text-xs font-bold uppercase tracking-[0.08em] ${isCurrent ? "border-brand text-ink" : "border-line text-muted"}`}>
              <span className="flex items-center gap-2">{group.stageName}{isCurrent && <Badge tone="brand">Current stage</Badge>}</span>
              <span className="font-normal normal-case tracking-normal">{signed} of {group.steps.length} signed</span>
            </h3>
            <ul className="divide-y divide-line">
              {group.steps.map((step) => (
                <li className="grid gap-2 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4" key={step.id}>
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    {step.label}
                    {step.requiresQa && <Badge tone="outline"><ShieldCheck className="mr-1" size={12} />QA</Badge>}
                    {!step.isRequired && <span className="text-xs font-normal text-muted">Optional</span>}
                  </p>
                  {step.record
                    ? <SignedStep canClear={!isClosed && (isManager || step.record.performedById === viewerId)} step={step} workOrderId={workOrderId} />
                    : isClosed
                      ? <p className="text-sm text-subtle">Not signed</p>
                      : step.requiresQa && !canSignQa
                        ? <p className="text-sm text-muted">Waiting for a quality assurance sign-off.</p>
                        : <OpenStep step={step} workOrderId={workOrderId} />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
