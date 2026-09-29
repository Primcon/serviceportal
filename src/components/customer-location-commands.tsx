"use client";

import { useId, useState } from "react";
import { Building2, MapPin, Plus } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { createCompany, createLocation } from "@/features/work-orders/actions";

type Company = { id: string; name: string };

export default function CustomerLocationCommands({ companies }: { companies: Company[] }) {
  const formId = useId();
  const [dialog, setDialog] = useState<"company" | "location" | null>(null);
  const close = () => setDialog(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button className={buttonStyles({ size: "sm" })} onClick={() => setDialog("company")} type="button"><Building2 size={16} /> Add customer</button>
        <button className={buttonStyles({ variant: "outline", size: "sm" })} disabled={!companies.length} onClick={() => setDialog("location")} type="button"><MapPin size={16} /> Add location</button>
      </div>

      {dialog === "company" && (
        <Modal eyebrow="CUSTOMER DIRECTORY" title="Add customer company" description="Create the company record before adding its service locations and equipment." onClose={close}>
          <ActionFeedbackForm action={createCompany} className="grid gap-4" successMessage="Customer company created." resetOnSuccess>
            <Field label="Company name" htmlFor={`${formId}-company-name`}>
              <input className={fieldStyles} id={`${formId}-company-name`} name="name" required />
            </Field>
            <div className="flex justify-end">
              <button className={buttonStyles()}><Plus size={16} /> Create customer</button>
            </div>
          </ActionFeedbackForm>
        </Modal>
      )}

      {dialog === "location" && (
        <Modal eyebrow="CUSTOMER DIRECTORY" title="Add service location" description="Attach a service site to its customer company for equipment and work-order organization." onClose={close}>
          <ActionFeedbackForm action={createLocation} className="grid gap-4 sm:grid-cols-2" successMessage="Service location created." resetOnSuccess>
            <Field label="Customer company" htmlFor={`${formId}-location-company`} className="sm:col-span-2">
              <select className={fieldStyles} id={`${formId}-location-company`} name="companyId" required>
                <option value="">Select company</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Location name" htmlFor={`${formId}-location-name`} className="sm:col-span-2">
              <input className={fieldStyles} id={`${formId}-location-name`} name="name" required />
            </Field>
            <Field label="Address" optional><input className={fieldStyles} name="addressLine" /></Field>
            <Field label="City" optional><input className={fieldStyles} name="city" /></Field>
            <Field label="Region" optional><input className={fieldStyles} name="region" /></Field>
            <Field label="Postal code" optional><input className={fieldStyles} name="postalCode" /></Field>
            <Field label="Country" optional className="sm:col-span-2"><input className={fieldStyles} name="country" /></Field>
            <div className="flex justify-end sm:col-span-2">
              <button className={buttonStyles({ variant: "secondary" })}><Plus size={16} /> Create location</button>
            </div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
