"use client";

import { useId, useState } from "react";
import { Pencil } from "lucide-react";
import type { CopperClassification } from "@prisma/client";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { updateWorkOrderDetails } from "@/features/work-orders/record-actions";
import { copperClassificationLabels } from "@/lib/labels";

export type EditableDetails = {
  id: string;
  summary: string;
  priority: string | null;
  serviceType: string | null;
  customerPurchaseOrder: string | null;
  rmaReference: string | null;
  promisedAt: string | null;
  serviceCenterId: string | null;
  toolId: string | null;
  oilType: string | null;
  oilWeight: string | null;
  reasonForService: string | null;
  contaminants: string | null;
  copperClassification: CopperClassification;
  accessoriesReceived: string | null;
  customerContactName: string | null;
  customerContactPhone: string | null;
  customerContactEmail: string | null;
};

type Option = { id: string; label: string };

/** Options for a picklist, keeping a work order's current value even if that option was later retired. */
function withCurrent(options: Option[], current: string | null) {
  return current && !options.some((option) => option.label === current) ? [...options, { id: `current-${current}`, label: current }] : options;
}

export function DetailsEditor({ details, priorities, serviceTypes, serviceCenters }: {
  details: EditableDetails;
  priorities: Option[];
  serviceTypes: Option[];
  serviceCenters: { id: string; code: string; name: string }[];
}) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const input = (name: keyof EditableDetails, label: string, props: { optional?: boolean; type?: string; placeholder?: string; className?: string; maxLength?: number } = {}) => (
    <Field className={props.className} htmlFor={`${id}-${name}`} label={label} optional={props.optional ?? true}>
      <input className={fieldStyles} defaultValue={(details[name] as string | null) ?? ""} id={`${id}-${name}`} maxLength={props.maxLength} name={name} placeholder={props.placeholder} type={props.type ?? "text"} />
    </Field>
  );

  return (
    <>
      <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><Pencil size={15} /> Edit details</button>
      {isOpen && (
        <Modal description="Changes are recorded in the audit log." eyebrow="WORK ORDER" onClose={() => setIsOpen(false)} size="lg" title="Edit details">
          <ActionFeedbackForm action={updateWorkOrderDetails} className="grid gap-5" successMessage="Details saved.">
            <input name="workOrderId" type="hidden" value={details.id} />
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Job</legend>
              <Field className="sm:col-span-2" htmlFor={`${id}-summary`} label="Summary">
                <textarea className={fieldStyles} defaultValue={details.summary} id={`${id}-summary`} maxLength={500} name="summary" required rows={2} />
              </Field>
              <Field htmlFor={`${id}-priority`} label="Priority" optional>
                <select className={fieldStyles} defaultValue={details.priority ?? ""} id={`${id}-priority`} name="priority"><option value="">Not set</option>{withCurrent(priorities, details.priority).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}</select>
              </Field>
              <Field htmlFor={`${id}-serviceType`} label="Service type" optional>
                <select className={fieldStyles} defaultValue={details.serviceType ?? ""} id={`${id}-serviceType`} name="serviceType"><option value="">Not set</option>{withCurrent(serviceTypes, details.serviceType).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}</select>
              </Field>
              {input("customerPurchaseOrder", "Customer PO", { maxLength: 80 })}
              {input("rmaReference", "RMA", { maxLength: 80 })}
              <Field htmlFor={`${id}-serviceCenterId`} label="Service center" optional>
                <select className={fieldStyles} defaultValue={details.serviceCenterId ?? ""} id={`${id}-serviceCenterId`} name="serviceCenterId"><option value="">Not set</option>{serviceCenters.map((center) => <option key={center.id} value={center.id}>{center.code} · {center.name}</option>)}</select>
              </Field>
              {input("promisedAt", "Promised date", { type: "date" })}
            </fieldset>

            <fieldset className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <legend className="mb-2 pt-4 text-xs font-bold uppercase tracking-[0.1em] text-muted">Intake (job order form)</legend>
              {input("toolId", "Tool ID", { maxLength: 80 })}
              <Field htmlFor={`${id}-copperClassification`} label="Copper / non-copper">
                <select className={fieldStyles} defaultValue={details.copperClassification} id={`${id}-copperClassification`} name="copperClassification">{Object.entries(copperClassificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </Field>
              {input("oilType", "Oil type", { maxLength: 80, placeholder: "Fomblin" })}
              {input("oilWeight", "Oil weight", { maxLength: 40, placeholder: "2.8 lb" })}
              {input("contaminants", "Contaminants", { maxLength: 200, placeholder: "N2", className: "sm:col-span-2" })}
              <Field className="sm:col-span-2" htmlFor={`${id}-reasonForService`} label="Reason for service" optional>
                <textarea className={fieldStyles} defaultValue={details.reasonForService ?? ""} id={`${id}-reasonForService`} maxLength={500} name="reasonForService" rows={2} />
              </Field>
              <Field className="sm:col-span-2" htmlFor={`${id}-accessoriesReceived`} label="Accessories received" optional>
                <input className={fieldStyles} defaultValue={details.accessoriesReceived ?? ""} id={`${id}-accessoriesReceived`} maxLength={500} name="accessoriesReceived" />
              </Field>
            </fieldset>

            <fieldset className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <legend className="mb-2 pt-4 text-xs font-bold uppercase tracking-[0.1em] text-muted">Customer contact for this repair</legend>
              {input("customerContactName", "Name", { maxLength: 120 })}
              {input("customerContactPhone", "Phone", { maxLength: 40, type: "tel" })}
              {input("customerContactEmail", "Email", { maxLength: 254, type: "email" })}
            </fieldset>

            <div className="flex justify-end"><button className={buttonStyles()}>Save details</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
