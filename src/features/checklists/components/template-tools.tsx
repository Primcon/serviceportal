"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";
import type { ChecklistStepType } from "@prisma/client";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { createChecklistRevision, deleteChecklistStep, moveChecklistStep, saveChecklistStep, saveChecklistTemplate } from "@/features/checklists/template-actions";

type Stage = { id: string; displayName: string };
export type EditableStep = { id: string; serviceStageId: string; label: string; type: ChecklistStepType; unit: string | null; items: string[]; requiresQa: boolean; isRequired: boolean };

const typeLabels: Record<ChecklistStepType, string> = {
  SIGN_OFF: "Sign-off (initials and date)",
  READING: "Reading (a measured value)",
  CHECKLIST: "List of items (each done or N/A)",
};

function StepForm({ templateId, stages, step, defaultStageId }: { templateId: string; stages: Stage[]; step?: EditableStep; defaultStageId?: string }) {
  const id = useId();
  const [type, setType] = useState<ChecklistStepType>(step?.type ?? "SIGN_OFF");
  return (
    <ActionFeedbackForm action={saveChecklistStep} className="grid gap-4 sm:grid-cols-2" feedbackClassName="sm:col-span-2" resetOnSuccess={!step}>
      <input name="templateId" type="hidden" value={templateId} />
      <input name="stepId" type="hidden" value={step?.id ?? ""} />
      <Field className="sm:col-span-2" htmlFor={`${id}-label`} label="Step"><input className={fieldStyles} defaultValue={step?.label ?? ""} id={`${id}-label`} maxLength={200} name="label" placeholder="Decontamination" required /></Field>
      <Field hint="The job can't leave this stage until the step is signed." htmlFor={`${id}-stage`} label="Done during">
        <select className={fieldStyles} defaultValue={step?.serviceStageId ?? defaultStageId ?? ""} id={`${id}-stage`} name="serviceStageId" required>
          <option value="">Choose stage</option>
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.displayName}</option>)}
        </select>
      </Field>
      <Field htmlFor={`${id}-type`} label="How it's completed">
        <select className={fieldStyles} id={`${id}-type`} name="type" onChange={(event) => setType(event.target.value as ChecklistStepType)} value={type}>
          {(Object.keys(typeLabels) as ChecklistStepType[]).map((option) => <option key={option} value={option}>{typeLabels[option]}</option>)}
        </select>
      </Field>
      {type === "READING" && <Field className="sm:col-span-2" hint="Shown after the value, such as mbar·l/s or psi." htmlFor={`${id}-unit`} label="Unit" optional><input className={fieldStyles} defaultValue={step?.unit ?? ""} id={`${id}-unit`} maxLength={30} name="unit" /></Field>}
      {type === "CHECKLIST" && <Field className="sm:col-span-2" hint="One item per line." htmlFor={`${id}-items`} label="Items"><textarea className={fieldStyles} defaultValue={step?.items.join("\n") ?? ""} id={`${id}-items`} name="items" required rows={6} /></Field>}
      <label className="flex items-start gap-2 text-sm"><input className="mt-0.5 size-4 accent-brand" defaultChecked={step?.isRequired ?? true} name="isRequired" type="checkbox" /><span><span className="font-bold">Required</span><span className="block text-muted">Holds the job at this stage until signed.</span></span></label>
      <label className="flex items-start gap-2 text-sm"><input className="mt-0.5 size-4 accent-brand" defaultChecked={step?.requiresQa ?? false} name="requiresQa" type="checkbox" /><span><span className="font-bold">Quality assurance sign-off</span><span className="block text-muted">Only QA, managers and administrators can sign it.</span></span></label>
      <div className="flex justify-end sm:col-span-2"><button className={buttonStyles()}>{step ? "Save step" : <><Plus size={16} /> Add step</>}</button></div>
    </ActionFeedbackForm>
  );
}

/** The "Add step" button and dialog. */
export function AddStepButton({ templateId, stages }: { templateId: string; stages: Stage[] }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className={buttonStyles({ size: "sm" })} onClick={() => setIsOpen(true)} type="button"><Plus size={16} /> Add step</button>
      {isOpen && <Modal eyebrow="CHECKLIST" onClose={() => setIsOpen(false)} title="Add step"><StepForm stages={stages} templateId={templateId} /></Modal>}
    </>
  );
}

/** Edit, reorder and remove controls on one step of an editable checklist. */
export function StepTools({ templateId, stages, step, isFirst, isLast }: { templateId: string; stages: Stage[]; step: EditableStep; isFirst: boolean; isLast: boolean }) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const close = () => setDialog(null);
  const move = (direction: "up" | "down", disabled: boolean) => (
    <ActionFeedbackForm action={moveChecklistStep} className="flex">
      <input name="stepId" type="hidden" value={step.id} />
      <input name="direction" type="hidden" value={direction} />
      <button aria-label={`Move ${step.label} ${direction}`} className={buttonStyles({ variant: "ghost", size: "sm" })} disabled={disabled}>{direction === "up" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</button>
    </ActionFeedbackForm>
  );
  return (
    <div className="flex items-center">
      {move("up", isFirst)}
      {move("down", isLast)}
      <button aria-label={`Edit ${step.label}`} className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => setDialog("edit")} type="button"><Pencil size={14} /></button>
      <button aria-label={`Remove ${step.label}`} className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => setDialog("delete")} type="button"><Trash2 size={14} /></button>
      {dialog === "edit" && <Modal eyebrow="CHECKLIST" onClose={close} title="Edit step"><StepForm stages={stages} step={step} templateId={templateId} /></Modal>}
      {dialog === "delete" && (
        <Modal description="No work order uses this revision yet, so nothing signed is lost." eyebrow="CHECKLIST" onClose={close} size="sm" title={`Remove “${step.label}”?`}>
          <ActionFeedbackForm action={deleteChecklistStep} className="flex flex-wrap justify-end gap-2">
            <input name="stepId" type="hidden" value={step.id} />
            <button className={buttonStyles({ variant: "outline" })} onClick={close} type="button">Cancel</button>
            <button className={buttonStyles({ variant: "danger" })}><Trash2 size={16} /> Remove step</button>
          </ActionFeedbackForm>
        </Modal>
      )}
    </div>
  );
}

/** The "New revision" button and dialog: copies this checklist so it can be changed. */
export function NewRevisionButton({ templateId, formNumber, revision }: { templateId: string; formNumber: string; revision: string }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><CopyPlus size={15} /> New revision</button>
      {isOpen && (
        <Modal description={`Starts a copy of form ${formNumber} Rev. ${revision} that you can edit. Nothing changes for work orders until you make the new revision active.`} eyebrow="CHECKLIST" onClose={() => setIsOpen(false)} size="sm" title="New revision">
          <ActionFeedbackForm action={createChecklistRevision} className="grid gap-4">
            <input name="templateId" type="hidden" value={templateId} />
            <Field htmlFor={`${id}-revision`} label="Revision"><input className={fieldStyles} id={`${id}-revision`} maxLength={20} name="revision" placeholder={/^\d+$/.test(revision) ? String(Number(revision) + 1) : "10"} required /></Field>
            <div className="flex justify-end"><button className={buttonStyles()}><CopyPlus size={16} /> Create revision</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}

/** Edits the form number, revision and name of an editable checklist. */
export function EditTemplateButton({ template }: { template: { id: string; formNumber: string; revision: string; name: string } }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><Pencil size={15} /> Rename</button>
      {isOpen && (
        <Modal eyebrow="CHECKLIST" onClose={() => setIsOpen(false)} size="sm" title="Form details">
          <ActionFeedbackForm action={saveChecklistTemplate} className="grid gap-4 sm:grid-cols-2" feedbackClassName="sm:col-span-2">
            <input name="templateId" type="hidden" value={template.id} />
            <Field htmlFor={`${id}-form`} label="Form number"><input className={fieldStyles} defaultValue={template.formNumber} id={`${id}-form`} maxLength={40} name="formNumber" required /></Field>
            <Field htmlFor={`${id}-revision`} label="Revision"><input className={fieldStyles} defaultValue={template.revision} id={`${id}-revision`} maxLength={20} name="revision" required /></Field>
            <Field className="sm:col-span-2" htmlFor={`${id}-name`} label="Form title"><input className={fieldStyles} defaultValue={template.name} id={`${id}-name`} maxLength={160} name="name" required /></Field>
            <div className="flex justify-end sm:col-span-2"><button className={buttonStyles()}>Save</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
