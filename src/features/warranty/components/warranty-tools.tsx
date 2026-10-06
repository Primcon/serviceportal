"use client";

import { useId, useState } from "react";
import { Check, Pencil, ShieldAlert, ShieldCheck, X } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { decideWarrantyClaim, openWarrantyClaim, saveContractWarranty, saveModelWarranty, saveShipping, withdrawWarrantyClaim } from "@/features/warranty/actions";

/** Edits a repair's ship date and warranty length. */
export function ShippingEditor({ workOrderId, shippedAt, warrantyMonths, standardNote, canChangeLength, today }: {
  workOrderId: string;
  /** yyyy-mm-dd, the form a date input uses. */
  shippedAt: string | null;
  warrantyMonths: number | null;
  /** Where the length comes from when nobody has set one, such as "6 months, from the model". */
  standardNote: string;
  canChangeLength: boolean;
  /** Today at the shop, yyyy-mm-dd: the latest ship date allowed. */
  today: string;
}) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><Pencil size={15} /> Edit</button>
      {isOpen && (
        <Modal description="The warranty runs from the ship date. Changes are recorded in the audit log." eyebrow="WORK ORDER" onClose={() => setIsOpen(false)} size="sm" title="Shipping and warranty">
          <ActionFeedbackForm action={saveShipping} className="grid gap-4">
            <input name="workOrderId" type="hidden" value={workOrderId} />
            <Field hint="Filled in automatically when the job moves to Shipped." htmlFor={`${id}-shipped`} label="Ship date" optional>
              <input className={fieldStyles} defaultValue={shippedAt ?? ""} id={`${id}-shipped`} max={today} name="shippedAt" type="date" />
            </Field>
            <Field hint={canChangeLength ? `Leave empty to use the standard: ${standardNote}. Enter 0 for no warranty.` : `Standard: ${standardNote}. A manager or warranty approver can change it.`} htmlFor={`${id}-months`} label="Warranty length in months" optional>
              <input className={fieldStyles} defaultValue={warrantyMonths ?? ""} id={`${id}-months`} inputMode="numeric" max={120} min={0} name="warrantyMonths" readOnly={!canChangeLength} type="number" />
            </Field>
            <div className="flex justify-end"><button className={buttonStyles()}>Save</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}

/** Opens a warranty claim on this job against the pump's previous repair. */
export function OpenClaimButton({ workOrderId, previousNumber }: { workOrderId: string; previousNumber: string }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><ShieldAlert size={15} /> Open a warranty claim</button>
      {isOpen && (
        <Modal description={`This job will be claimed against the warranty on WIP ${previousNumber}. It moves to Warranty review and the warranty approvers are emailed.`} eyebrow="WARRANTY" onClose={() => setIsOpen(false)} size="sm" title="Open a warranty claim">
          <ActionFeedbackForm action={openWarrantyClaim} className="grid gap-4">
            <input name="workOrderId" type="hidden" value={workOrderId} />
            <Field hint="What failed, and why it looks like a warranty matter. Staff only." htmlFor={`${id}-reason`} label="Reason" optional>
              <textarea className={fieldStyles} id={`${id}-reason`} maxLength={1000} name="reason" rows={3} />
            </Field>
            <div className="flex justify-end gap-2">
              <button className={buttonStyles({ variant: "outline" })} onClick={() => setIsOpen(false)} type="button">Cancel</button>
              <button className={buttonStyles()}><ShieldAlert size={16} /> Open claim</button>
            </div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}

/** The approver's decision on a claim, and the withdraw control while it's undecided. */
export function ClaimDecision({ workOrderId, decision, canDecide }: { workOrderId: string; decision: "PENDING" | "APPROVED" | "DENIED"; canDecide: boolean }) {
  const id = useId();
  return (
    <div className="grid gap-3">
      {canDecide && (
        <ActionFeedbackForm action={decideWarrantyClaim} className="grid gap-3">
          <input name="workOrderId" type="hidden" value={workOrderId} />
          <Field hint="Required to deny. Staff only; kept with the job." htmlFor={`${id}-note`} label={decision === "PENDING" ? "Decision note" : "Change the decision"} optional>
            <textarea className={fieldStyles} id={`${id}-note`} maxLength={1000} name="note" rows={2} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {decision !== "APPROVED" && <button className={buttonStyles({ size: "sm" })} name="decision" value="APPROVED"><Check size={15} /> Approve</button>}
            {decision !== "DENIED" && <button className={buttonStyles({ variant: "danger", size: "sm" })} name="decision" value="DENIED"><X size={15} /> Deny</button>}
          </div>
        </ActionFeedbackForm>
      )}
      {decision === "PENDING" && (
        <ActionFeedbackForm action={withdrawWarrantyClaim}>
          <input name="workOrderId" type="hidden" value={workOrderId} />
          <button className="text-xs font-bold text-muted hover:text-brand">Opened by mistake? Withdraw the claim</button>
        </ActionFeedbackForm>
      )}
    </div>
  );
}

/** Sets a model's standard warranty or a customer's contract warranty, in months. */
export function WarrantyMonthsButton({ kind, recordId, months }: { kind: "model" | "contract"; recordId: string; months: number | null }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const isModel = kind === "model";
  return (
    <>
      <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><ShieldCheck size={15} /> {months ? "Change" : "Set"}</button>
      {isOpen && (
        <Modal
          description={isModel
            ? "The repair warranty every pump of this model gets when it ships, unless the customer's contract says otherwise."
            : "The repair warranty this customer's service contract gives. It's used instead of each model's standard warranty."}
          eyebrow="WARRANTY"
          onClose={() => setIsOpen(false)}
          size="sm"
          title={isModel ? "Standard warranty" : "Contract warranty"}
        >
          <ActionFeedbackForm action={isModel ? saveModelWarranty : saveContractWarranty} className="grid gap-4">
            <input name={isModel ? "modelId" : "companyId"} type="hidden" value={recordId} />
            <Field hint={`Leave empty for ${isModel ? "no standard warranty" : "no contract terms"}. Repairs that have already shipped keep the warranty they shipped with.`} htmlFor={`${id}-months`} label="Length in months" optional>
              <input className={fieldStyles} defaultValue={months ?? ""} id={`${id}-months`} inputMode="numeric" max={120} min={1} name="months" placeholder="12" type="number" />
            </Field>
            <div className="flex justify-end"><button className={buttonStyles()}>Save</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
