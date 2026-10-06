"use client";

import { useId, useState } from "react";
import { Pencil } from "lucide-react";
import type { PartsKit } from "@prisma/client";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { updatePartsAndQuote } from "@/features/work-orders/record-actions";
import { partsKitLabels } from "@/lib/labels";

export type EditableParts = {
  workOrderId: string;
  partsRequired: string | null;
  partsKit: PartsKit | null;
  extraLaborHours: string | null;
  /** Dates as yyyy-mm-dd, the form a date input uses. */
  quotedAt: string | null;
  partsOrderedAt: string | null;
  partsReceivedAt: string | null;
  partsReceivedById: string | null;
};

/** Edits the parts and quote section of the job order form. */
export function PartsEditor({ parts, staff, viewerId }: { parts: EditableParts; staff: { id: string; displayName: string }[]; viewerId: string }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const date = (name: "quotedAt" | "partsOrderedAt" | "partsReceivedAt", label: string) => (
    <Field htmlFor={`${id}-${name}`} label={label} optional><input className={fieldStyles} defaultValue={parts[name] ?? ""} id={`${id}-${name}`} name={name} type="date" /></Field>
  );

  return (
    <>
      <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><Pencil size={15} /> Edit</button>
      {isOpen && (
        <Modal description="From the parts section of the job order form. Changes are recorded in the audit log." eyebrow="WORK ORDER" onClose={() => setIsOpen(false)} title="Parts and quote">
          <ActionFeedbackForm action={updatePartsAndQuote} className="grid gap-4 sm:grid-cols-2" feedbackClassName="sm:col-span-2">
            <input name="workOrderId" type="hidden" value={parts.workOrderId} />
            <Field className="sm:col-span-2" hint="One part per line." htmlFor={`${id}-parts`} label="Parts required" optional>
              <textarea className={fieldStyles} defaultValue={parts.partsRequired ?? ""} id={`${id}-parts`} maxLength={2000} name="partsRequired" rows={4} />
            </Field>
            <Field htmlFor={`${id}-kit`} label="Kit" optional>
              <select className={fieldStyles} defaultValue={parts.partsKit ?? ""} id={`${id}-kit`} name="partsKit">
                <option value="">Not decided</option>
                {(Object.keys(partsKitLabels) as PartsKit[]).map((kit) => <option key={kit} value={kit}>{partsKitLabels[kit]}</option>)}
              </select>
            </Field>
            <Field htmlFor={`${id}-hours`} label="Extra labor hours" optional><input className={fieldStyles} defaultValue={parts.extraLaborHours ?? ""} id={`${id}-hours`} inputMode="decimal" name="extraLaborHours" placeholder="2.5" /></Field>
            {date("quotedAt", "Customer quoted")}
            {date("partsOrderedAt", "Parts ordered")}
            {date("partsReceivedAt", "Parts received and inspected")}
            <Field hint="Used only when a received date is set." htmlFor={`${id}-receiver`} label="Received by" optional>
              <select className={fieldStyles} defaultValue={parts.partsReceivedById ?? ""} id={`${id}-receiver`} name="partsReceivedById">
                <option value="">Me</option>
                {staff.filter((person) => person.id !== viewerId).map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
              </select>
            </Field>
            <div className="flex justify-end sm:col-span-2"><button className={buttonStyles()}>Save</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
