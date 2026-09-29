"use client";

import { useId, useState } from "react";
import { Ban, CheckCircle2, Plus, ShieldCheck, UserCog } from "lucide-react";
import type { UserRole } from "@prisma/client";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { grantUserAccess, revokeUserAccess, updateInternalUserRole, updateUserActiveStatus } from "@/features/admin/actions";
import { roleLabels } from "@/lib/labels";

type User = { id: string; displayName: string; email: string; isActive: boolean; internalRole: UserRole | null; access: { id: string; role: string; scope: string; company: { name: string }; location: { name: string } | null }[] };
type Company = { id: string; name: string; locations: { id: string; name: string }[] };

export default function UserDirectory({ users, companies }: { users: User[]; companies: Company[] }) {
  const dialogId = useId();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  // Read the user from the latest server data, so the dialog reflects each saved change.
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  return (
    <>
      <div className="border-y border-line bg-paper">
        {users.map((user) => (
          <article className="grid gap-4 border-b border-line px-5 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={user.id}>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{user.displayName}</h3>
                <Badge tone={user.isActive ? "brand" : "neutral"}>{user.isActive ? "Active" : "Disabled"}</Badge>
                {user.internalRole && <Badge tone="outline">{roleLabels[user.internalRole]}</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted">{user.email}</p>
            </div>
            <p className="text-sm text-muted">{user.access.length ? `${user.access.length} customer grant${user.access.length === 1 ? "" : "s"}` : "No customer grants"}</p>
            <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setSelectedUserId(user.id)} type="button"><UserCog size={16} /> Manage</button>
          </article>
        ))}
      </div>

      {selectedUser && (
        <Modal eyebrow="USER ADMINISTRATION" title={selectedUser.displayName} description={selectedUser.email} onClose={() => setSelectedUserId(null)} size="lg">
          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className="font-bold">Account access</h3>
              <p className="mt-1 text-sm text-muted">Disabled users lose portal access immediately.</p>
              <ActionFeedbackForm action={updateUserActiveStatus} className="mt-4" successMessage="Access status updated.">
                <input name="userId" type="hidden" value={selectedUser.id} />
                <input name="isActive" type="hidden" value={selectedUser.isActive ? "false" : "true"} />
                <button className={buttonStyles({ variant: selectedUser.isActive ? "danger" : "primary" })}>
                  {selectedUser.isActive ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                  {selectedUser.isActive ? "Disable access" : "Enable access"}
                </button>
              </ActionFeedbackForm>
              {selectedUser.internalRole && (
                <ActionFeedbackForm action={updateInternalUserRole} className="mt-6 grid gap-3 border-t border-line pt-5" successMessage="Internal role updated.">
                  <input name="userId" type="hidden" value={selectedUser.id} />
                  <Field label="Internal role" htmlFor={`${dialogId}-role`} hint="Roles are managed here. Changing a role in Entra has no effect after an employee's first sign-in.">
                    <select className={fieldStyles} defaultValue={selectedUser.internalRole} id={`${dialogId}-role`} key={selectedUser.internalRole} name="internalRole">
                      <option value="PORTAL_ADMINISTRATOR">Portal administrator</option>
                      <option value="VACTECH_MANAGER">VacTech manager</option>
                      <option value="VACTECH_SERVICE_USER">VacTech service user</option>
                    </select>
                  </Field>
                  <button className={buttonStyles({ variant: "secondary", className: "w-fit" })}>Update role</button>
                </ActionFeedbackForm>
              )}
            </section>

            <section>
              <div className="flex items-center gap-2"><ShieldCheck className="text-brand" size={19} /><h3 className="font-bold">Customer access</h3></div>
              <div className="mt-4 grid gap-2">
                {selectedUser.access.length ? selectedUser.access.map((grant) => (
                  <div className="flex items-center justify-between gap-3 border-l-2 border-brand-soft pl-3 text-sm" key={grant.id}>
                    <span>{grant.company.name} · {grant.location?.name ?? "All locations"}</span>
                    <ActionFeedbackForm action={revokeUserAccess} successMessage="Access revoked.">
                      <input name="accessId" type="hidden" value={grant.id} />
                      <button className="text-xs font-bold text-danger">Revoke</button>
                    </ActionFeedbackForm>
                  </div>
                )) : <p className="text-sm text-muted">No customer access grants.</p>}
              </div>
              <ActionFeedbackForm action={grantUserAccess} className="mt-6 grid gap-3 border-t border-line pt-5" successMessage="Customer access granted.">
                <input name="userId" type="hidden" value={selectedUser.id} />
                <Field label="Customer company" htmlFor={`${dialogId}-company`}>
                  <select className={fieldStyles} id={`${dialogId}-company`} name="companyId" required>
                    <option value="">Select company</option>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                </Field>
                <Field label="Access scope" htmlFor={`${dialogId}-location`}>
                  <select className={fieldStyles} id={`${dialogId}-location`} name="locationId">
                    <option value="">All company locations</option>
                    {companies.flatMap((company) => company.locations.map((location) => <option key={location.id} value={location.id}>{company.name} · {location.name}</option>))}
                  </select>
                </Field>
                <button className={buttonStyles({ className: "w-fit" })}><Plus size={16} /> Grant access</button>
              </ActionFeedbackForm>
            </section>
          </div>
        </Modal>
      )}
    </>
  );
}
