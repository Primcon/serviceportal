"use client";

import { useState } from "react";
import { Eye, EyeOff, Lightbulb, MessageSquareText, Send } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { postWorkOrderEntry } from "@/features/work-orders/record-actions";

const tabs = [
  { kind: "customer-update", label: "Customer update", icon: Send, hint: "Visible to the customer in the portal." },
  { kind: "internal-note", label: "Internal note", icon: MessageSquareText, hint: "Only VacTech staff can see notes." },
  { kind: "finding", label: "Finding", icon: Lightbulb, hint: "What the inspection or teardown found. Internal unless you share it." },
] as const;

type Kind = (typeof tabs)[number]["kind"];

/** One place to post to a work order: an update for the customer, a note for staff, or a finding. */
export function TimelineComposer({ workOrderId, customerHasPortalUsers }: { workOrderId: string; customerHasPortalUsers: boolean }) {
  const [kind, setKind] = useState<Kind>("customer-update");
  const active = tabs.find((tab) => tab.kind === kind)!;

  return (
    <section aria-label="Add to the timeline" className="border border-line bg-paper">
      <div className="flex border-b border-line" role="tablist">
        {tabs.map(({ kind: tabKind, label, icon: Icon }) => (
          <button
            aria-label={label}
            aria-selected={kind === tabKind}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-bold ${kind === tabKind ? "border-brand text-ink" : "border-transparent text-muted hover:text-brand"}`}
            key={tabKind}
            onClick={() => setKind(tabKind)}
            role="tab"
            type="button"
          >
            <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
      <ActionFeedbackForm action={postWorkOrderEntry} className="grid gap-3 p-5" key={kind} resetOnSuccess successMessage="Posted.">
        <input name="workOrderId" type="hidden" value={workOrderId} />
        <input name="kind" type="hidden" value={kind} />
        <p className="flex items-center gap-2 text-xs text-muted">{kind === "internal-note" ? <EyeOff size={14} /> : <Eye size={14} />}{active.hint}</p>
        {kind !== "internal-note" && (
          <Field label="Title" htmlFor={`${kind}-title`}>
            <input className={fieldStyles} id={`${kind}-title`} maxLength={160} name="title" placeholder={kind === "finding" ? "Scored rotor on inlet stage" : "Rebuild underway"} required />
          </Field>
        )}
        <Field label={kind === "internal-note" ? "Note" : kind === "finding" ? "Details" : "Message"} htmlFor={`${kind}-body`}>
          <textarea className={fieldStyles} id={`${kind}-body`} name="body" required rows={kind === "internal-note" ? 3 : 4} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {kind === "customer-update" && (
            <label className="flex items-center gap-2 text-sm">
              <input className="size-4 accent-brand" defaultChecked={customerHasPortalUsers} disabled={!customerHasPortalUsers} name="notifyCustomer" type="checkbox" />
              {customerHasPortalUsers ? "Email the customer" : "No customer portal users to email yet"}
            </label>
          )}
          {kind === "finding" && (
            <label className="flex items-center gap-2 text-sm"><input className="size-4 accent-brand" name="shareWithCustomer" type="checkbox" /> Share with the customer</label>
          )}
          {kind === "internal-note" && <span />}
          <button className={buttonStyles({ variant: kind === "customer-update" ? "primary" : "secondary" })}>
            {kind === "customer-update" ? "Post update" : kind === "finding" ? "Add finding" : "Add note"}
          </button>
        </div>
      </ActionFeedbackForm>
    </section>
  );
}
