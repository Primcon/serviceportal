import { ListKind } from "@prisma/client";
import { Building, Flag, Hash, Plus, Settings, ShieldCheck, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles, fieldStyles, panelStyles } from "@/components/ui/styles";
import { managerRoles } from "@/features/navigation/workspace-items";
import { saveListOption, saveNextWorkOrderNumber, saveServiceCenter } from "@/features/settings/actions";
import { listOptions, serviceCenters, workOrderNumbering } from "@/features/settings/queries";
import { saveCustomerWarrantyVisibility } from "@/features/warranty/actions";
import { customerWarrantyVisible, warrantyApprovers } from "@/features/warranty/queries";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

function SettingsSection({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className={panelStyles}>
      <div className="flex items-center gap-2">{icon}<h2 className="text-xl font-bold">{title}</h2></div>
      <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

async function PicklistSection({ kind, title, description, icon }: { kind: ListKind; title: string; description: string; icon: ReactNode }) {
  const options = await listOptions(kind, { includeInactive: true });
  return (
    <SettingsSection description={description} icon={icon} title={title}>
      <div className="hidden grid-cols-[minmax(0,1fr)_88px_88px_auto] gap-3 border-b border-line pb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted sm:grid">
        <span>Label</span><span>Order</span><span>In use</span><span className="sr-only">Save</span>
      </div>
      <div className="divide-y divide-line">
        {options.map((option) => (
          <ActionFeedbackForm action={saveListOption} className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_88px_88px_auto]" feedbackClassName="sm:col-span-4" key={option.id} successMessage="Saved.">
            <input name="id" type="hidden" value={option.id} />
            <input name="kind" type="hidden" value={kind} />
            <input name="isActiveField" type="hidden" value="1" />
            <label className="sr-only" htmlFor={`label-${option.id}`}>Label</label>
            <input className={`${fieldStyles} ${option.isActive ? "" : "text-muted line-through"}`} defaultValue={option.label} id={`label-${option.id}`} name="label" required />
            <label className="sr-only" htmlFor={`order-${option.id}`}>Order</label>
            <input className={fieldStyles} defaultValue={option.sortOrder} id={`order-${option.id}`} min={0} name="sortOrder" type="number" />
            <label className="flex items-center gap-2 text-sm"><input className="size-4 accent-brand" defaultChecked={option.isActive} name="isActive" type="checkbox" /> Active</label>
            <button className={buttonStyles({ variant: "outline", size: "sm" })}>Save</button>
          </ActionFeedbackForm>
        ))}
      </div>
      <ActionFeedbackForm action={saveListOption} className="mt-4 grid items-end gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_88px_auto]" feedbackClassName="sm:col-span-3" resetOnSuccess successMessage="Added.">
        <input name="kind" type="hidden" value={kind} />
        <label className="grid gap-1.5 text-sm font-bold" htmlFor={`new-${kind}`}>New option<input className={fieldStyles} id={`new-${kind}`} name="label" required /></label>
        <label className="grid gap-1.5 text-sm font-bold" htmlFor={`new-order-${kind}`}>Order<input className={fieldStyles} defaultValue={(options.at(-1)?.sortOrder ?? 0) + 1} id={`new-order-${kind}`} min={0} name="sortOrder" type="number" /></label>
        <button className={buttonStyles({ size: "sm", className: "h-[42px]" })}><Plus size={16} /> Add</button>
      </ActionFeedbackForm>
    </SettingsSection>
  );
}

export default async function SettingsPage() {
  await requireWorkspaceUser(managerRoles);
  const [centers, numbering, customersSeeWarranty, approvers] = await Promise.all([serviceCenters({ includeInactive: true }), workOrderNumbering(), customerWarrantyVisible(), warrantyApprovers()]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <PageHeader
        description="The lists and locations work orders are filed under. Retire an entry instead of deleting it, so older work orders keep their values."
        eyebrow="ADMINISTRATION"
        icon={<Settings size={16} />}
        title="Settings"
      />

      <div className="mt-8 grid gap-6">
        <SettingsSection
          description="VacTech facilities that perform repairs. Each work order records the center doing the work. The contact email and phone are shown to customers on their repairs."
          icon={<Building className="text-brand" size={20} />}
          title="Service centers"
        >
          <div className="divide-y divide-line">
            {centers.map((center) => (
              <ActionFeedbackForm action={saveServiceCenter} className="grid items-center gap-3 py-3 sm:grid-cols-[96px_minmax(0,1fr)_auto_88px_auto]" feedbackClassName="sm:col-span-5" key={center.id} successMessage="Saved.">
                <input name="id" type="hidden" value={center.id} />
                <input name="isActiveField" type="hidden" value="1" />
                <label className="sr-only" htmlFor={`code-${center.id}`}>Code</label>
                <input className={`${fieldStyles} font-bold uppercase`} defaultValue={center.code} id={`code-${center.id}`} maxLength={4} name="code" readOnly={center._count.workOrders > 0} required title={center._count.workOrders > 0 ? "Codes can't change once work orders use them." : undefined} />
                <label className="sr-only" htmlFor={`name-${center.id}`}>Name</label>
                <input className={fieldStyles} defaultValue={center.name} id={`name-${center.id}`} name="name" required />
                <span className="text-sm text-muted">{center._count.workOrders} work order{center._count.workOrders === 1 ? "" : "s"}</span>
                <label className="flex items-center gap-2 text-sm"><input className="size-4 accent-brand" defaultChecked={center.isActive} name="isActive" type="checkbox" /> Active</label>
                <button className={buttonStyles({ variant: "outline", size: "sm" })}>Save</button>
                {/* Shown to customers on their repairs as the place to ask questions. */}
                <label className="grid gap-1 text-xs text-muted sm:col-span-2" htmlFor={`email-${center.id}`}>Customer contact email<input className={fieldStyles} defaultValue={center.contactEmail ?? ""} id={`email-${center.id}`} maxLength={254} name="contactEmail" placeholder="service@example.com" type="email" /></label>
                <label className="grid gap-1 text-xs text-muted sm:col-span-3" htmlFor={`phone-${center.id}`}>Customer contact phone<input className={fieldStyles} defaultValue={center.contactPhone ?? ""} id={`phone-${center.id}`} maxLength={40} name="contactPhone" placeholder="(480) 555-0100" type="tel" /></label>
              </ActionFeedbackForm>
            ))}
            {!centers.length && <p className="py-3 text-sm text-muted">No service centers yet. Add the first one below.</p>}
          </div>
          <ActionFeedbackForm action={saveServiceCenter} className="mt-4 grid items-end gap-3 border-t border-line pt-4 sm:grid-cols-[96px_minmax(0,1fr)_auto]" feedbackClassName="sm:col-span-3" resetOnSuccess successMessage="Added.">
            <label className="grid gap-1.5 text-sm font-bold" htmlFor="new-center-code">Code<input className={`${fieldStyles} uppercase`} id="new-center-code" maxLength={4} name="code" placeholder="AZ" required /></label>
            <label className="grid gap-1.5 text-sm font-bold" htmlFor="new-center-name">Name<input className={fieldStyles} id="new-center-name" name="name" placeholder="Arizona service center" required /></label>
            <button className={buttonStyles({ size: "sm", className: "h-[42px]" })}><Plus size={16} /> Add</button>
          </ActionFeedbackForm>
        </SettingsSection>

        <SettingsSection
          description="The portal numbers each new work order automatically, counting up from here. Set this once at go-live so numbering carries on from the old system; it can't go back to a number that's already been used."
          icon={<Hash className="text-brand" size={20} />}
          title="Work order numbers"
        >
          <ActionFeedbackForm action={saveNextWorkOrderNumber} className="grid items-end gap-3 sm:grid-cols-[200px_auto_minmax(0,1fr)]" feedbackClassName="sm:col-span-3" successMessage="Saved.">
            <label className="grid gap-1.5 text-sm font-bold" htmlFor="next-wip">Next WIP number<input className={fieldStyles} defaultValue={numbering.next} id="next-wip" key={numbering.next} min={numbering.highest + 1} name="nextNumber" required type="number" /></label>
            <button className={buttonStyles({ variant: "outline", size: "sm", className: "h-[42px]" })}>Save</button>
            <p className="text-sm text-muted">{numbering.highest ? `Highest used so far: ${numbering.highest}.` : "No work orders yet."}</p>
          </ActionFeedbackForm>
        </SettingsSection>

        <SettingsSection
          description="A repair's warranty runs from its ship date. Its length comes from the customer's contract if they have one, otherwise from the pump model's standard warranty; set those on the customer's and the model's pages."
          icon={<ShieldCheck className="text-brand" size={20} />}
          title="Warranty"
        >
          <p className="text-sm"><span className="font-bold">Claims are decided by:</span> {approvers.length ? approvers.map((approver) => approver.displayName).join(", ") : <span className="text-danger">nobody yet</span>}. <a className="font-bold text-brand" href="/workspace/users">Choose approvers in Users</a></p>
          <ActionFeedbackForm action={saveCustomerWarrantyVisibility} className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-4" key={String(customersSeeWarranty)}>
            <label className="flex items-start gap-2 text-sm"><input className="mt-0.5 size-4 accent-brand" defaultChecked={customersSeeWarranty} name="visible" type="checkbox" /><span><span className="font-bold">Show customers their warranty dates</span><span className="block text-muted">When on, customers see &ldquo;Covered until&rdquo; on shipped repairs and on their equipment. Claims and decisions always stay internal.</span></span></label>
            <button className={buttonStyles({ variant: "outline", size: "sm" })}>Save</button>
          </ActionFeedbackForm>
        </SettingsSection>

        <PicklistSection description="How urgent a job is. Shown on work orders, queues and the printed traveler." icon={<Flag className="text-brand" size={20} />} kind={ListKind.PRIORITY} title="Priorities" />
        <PicklistSection description="The kind of work being done, such as a rebuild or an evaluation." icon={<Wrench className="text-brand" size={20} />} kind={ListKind.SERVICE_TYPE} title="Service types" />
      </div>
    </main>
  );
}
