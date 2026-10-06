"use client";

import { useId, useState } from "react";
import { CheckCircle2, Edit3, PauseCircle } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { updateServiceStage } from "@/features/admin/actions";
import { customerStatusLabels } from "@/lib/labels";

type Stage = {
  id: string;
  code: string;
  displayName: string;
  sequence: number;
  customerFacingStatus: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED";
  customerLabel: string | null;
  isActive: boolean;
};

export default function WorkflowStageList({ stages }: { stages: Stage[] }) {
  const dialogId = useId();
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);

  return (
    <>
      <div className="border-y border-line bg-paper">
        {stages.map((stage) => (
          <article className="grid gap-4 border-b border-line px-5 py-5 last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)_auto_auto] sm:items-center" key={stage.id}>
            <div className="flex size-10 items-center justify-center border border-line text-sm font-bold text-muted">{stage.sequence}</div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{stage.displayName}</h3>
                <Badge tone={stage.isActive ? "brand" : "neutral"}>{stage.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{stage.code}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Customer sees</span>
              <span className="font-bold">{stage.customerLabel || stage.displayName} · {customerStatusLabels[stage.customerFacingStatus]}</span>
            </div>
            <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setSelectedStage(stage)} type="button"><Edit3 size={16} /> Edit</button>
          </article>
        ))}
      </div>

      {selectedStage && (
        <Modal eyebrow="WORKFLOW STAGE" title={selectedStage.displayName} description={`Sequence ${selectedStage.sequence} · ${selectedStage.code}`} onClose={() => setSelectedStage(null)} size="sm">
          <ActionFeedbackForm action={updateServiceStage} className="grid gap-4" successMessage="Workflow stage updated.">
            <input name="serviceStageId" type="hidden" value={selectedStage.id} />
            <Field label="Step shown to customers" htmlFor={`${dialogId}-label`} hint="The name on the customer's progress tracker. Give neighbouring stages the same name to show them as one step. Leave blank to use the stage's own name.">
              <input className={fieldStyles} defaultValue={selectedStage.customerLabel ?? ""} id={`${dialogId}-label`} maxLength={40} name="customerLabel" placeholder={selectedStage.displayName} />
            </Field>
            <Field label="Customer-facing status" htmlFor={`${dialogId}-status`} hint="Work orders already in this stage switch to the new status. Customers aren't emailed about it.">
              <select className={fieldStyles} defaultValue={selectedStage.customerFacingStatus} id={`${dialogId}-status`} name="customerFacingStatus">
                {Object.entries(customerStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Availability" htmlFor={`${dialogId}-availability`}>
              <select className={fieldStyles} defaultValue={String(selectedStage.isActive)} id={`${dialogId}-availability`} name="isActive">
                <option value="true">Active and selectable</option>
                <option value="false">Inactive</option>
              </select>
            </Field>
            <div className="border-l-4 border-line bg-surface px-4 py-3 text-sm text-muted">
              <div className="flex items-start gap-2">
                {selectedStage.isActive ? <CheckCircle2 className="mt-0.5 shrink-0 text-brand" size={18} /> : <PauseCircle className="mt-0.5 shrink-0 text-brand" size={18} />}
                <p>Inactive stages remain visible in work-order history but cannot be selected for a new service-state update.</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button className={buttonStyles()}><Edit3 size={16} /> Save stage</button>
            </div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
