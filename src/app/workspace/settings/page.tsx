import { ListKind } from "@prisma/client";
import { Building, Flag, Plus, Settings, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles, fieldStyles, panelStyles } from "@/components/ui/styles";
import { managerRoles } from "@/features/navigation/workspace-items";
import { saveListOption, saveServiceCenter } from "@/features/settings/actions";
import { listOptions, serviceCenters } from "@/features/settings/queries";
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
  const centers = await serviceCenters({ includeInactive: true });

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
          description="VacTech facilities that perform repairs. The code is the suffix on work order numbers, such as AZ in 48366 AZ."
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

        <PicklistSection description="How urgent a job is. Shown on work orders, queues and the printed traveler." icon={<Flag className="text-brand" size={20} />} kind={ListKind.PRIORITY} title="Priorities" />
        <PicklistSection description="The kind of work being done, such as a rebuild or an evaluation." icon={<Wrench className="text-brand" size={20} />} kind={ListKind.SERVICE_TYPE} title="Service types" />
      </div>
    </main>
  );
}
