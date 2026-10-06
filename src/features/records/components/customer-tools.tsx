"use client";

import { useId, useState } from "react";
import { Archive, ArchiveRestore, Combine, MapPin, Pencil, Plus, UserPlus } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { inviteCustomerUser } from "@/features/access/actions";
import { mergeCompanies, setCompanyArchived, setLocationArchived, updateCompany, updateLocation } from "@/features/records/actions";
import { createLocation } from "@/features/work-orders/actions";

type Customer = { id: string; name: string; isArchived: boolean };
type Location = { id: string; name: string; addressLine: string | null; city: string | null; region: string | null; postalCode: string | null; country: string | null; isArchived: boolean };

/** Rename, merge and archive controls for a customer. */
export function CustomerTools({ customer, otherCustomers, summary }: { customer: Customer; otherCustomers: { id: string; name: string }[]; summary: string }) {
  const id = useId();
  const [dialog, setDialog] = useState<"rename" | "merge" | null>(null);
  const close = () => setDialog(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!customer.isArchived && <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setDialog("rename")} type="button"><Pencil size={15} /> Rename</button>}
        {!customer.isArchived && <button className={buttonStyles({ variant: "outline", size: "sm" })} disabled={!otherCustomers.length} onClick={() => setDialog("merge")} type="button"><Combine size={15} /> Merge duplicate</button>}
        <ActionFeedbackForm action={setCompanyArchived} className="flex flex-wrap items-center gap-2" feedbackClassName="max-w-xs">
          <input name="companyId" type="hidden" value={customer.id} />
          <input name="archived" type="hidden" value={customer.isArchived ? "false" : "true"} />
          <button className={buttonStyles({ variant: "outline", size: "sm" })}>{customer.isArchived ? <><ArchiveRestore size={15} /> Restore</> : <><Archive size={15} /> Archive</>}</button>
        </ActionFeedbackForm>
      </div>

      {dialog === "rename" && (
        <Modal description="The new name appears everywhere, including on past work orders and in the customer's portal." eyebrow="CUSTOMER" onClose={close} size="sm" title="Rename customer">
          <ActionFeedbackForm action={updateCompany} className="grid gap-4">
            <input name="companyId" type="hidden" value={customer.id} />
            <Field htmlFor={`${id}-name`} label="Company name"><input className={fieldStyles} defaultValue={customer.name} id={`${id}-name`} maxLength={160} name="name" required /></Field>
            <div className="flex justify-end"><button className={buttonStyles()}>Save name</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}

      {dialog === "merge" && (
        <Modal description="Use this when the same company was entered twice, for example as “Acme” and “Acme Corp”." eyebrow="CUSTOMER" onClose={close} title="Merge duplicate customer">
          <ActionFeedbackForm action={mergeCompanies} className="grid gap-5">
            <input name="duplicateId" type="hidden" value={customer.id} />
            <div className="border-l-4 border-line bg-surface px-4 py-3 text-sm">
              <p className="font-bold">This record will be merged away</p>
              <p className="mt-1 text-muted">{customer.name} · {summary}</p>
            </div>
            <Field htmlFor={`${id}-keep`} label="Customer to keep">
              <select className={fieldStyles} defaultValue="" id={`${id}-keep`} name="keepId" required>
                <option value="">Choose customer</option>
                {otherCustomers.map((other) => <option key={other.id} value={other.id}>{other.name}</option>)}
              </select>
            </Field>
            <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted">
              <li>Locations, pumps, work orders and files move to the customer you keep.</li>
              <li>Locations with the same name are combined, and so are pumps with the same serial number.</li>
              <li>People who can sign in for this customer will see the kept customer&apos;s records instead.</li>
              <li>This record is archived. A merge can&apos;t be undone.</li>
            </ul>
            <div className="flex justify-end gap-2">
              <button className={buttonStyles({ variant: "outline" })} onClick={close} type="button">Cancel</button>
              <button className={buttonStyles({ variant: "danger" })}><Combine size={16} /> Merge into the customer above</button>
            </div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}

function LocationFields({ id, location }: { id: string; location?: Location }) {
  const input = (name: "addressLine" | "city" | "region" | "postalCode" | "country", label: string, className = "") => (
    <Field className={className} htmlFor={`${id}-${name}`} label={label} optional><input className={fieldStyles} defaultValue={location?.[name] ?? ""} id={`${id}-${name}`} name={name} /></Field>
  );
  return (
    <>
      <Field className="sm:col-span-2" htmlFor={`${id}-name`} label="Location name"><input className={fieldStyles} defaultValue={location?.name ?? ""} id={`${id}-name`} maxLength={160} name="name" placeholder="Chandler fab" required /></Field>
      {input("addressLine", "Address", "sm:col-span-2")}
      {input("city", "City")}
      {input("region", "State or region")}
      {input("postalCode", "Postal code")}
      {input("country", "Country")}
    </>
  );
}

/** The "Add location" button and dialog for one customer. */
export function AddLocationButton({ companyId }: { companyId: string }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><Plus size={15} /> Add location</button>
      {isOpen && (
        <Modal description="A site where this customer's pumps are installed. Customer logins can be limited to one location." eyebrow="CUSTOMER" onClose={() => setIsOpen(false)} title="Add location">
          <ActionFeedbackForm action={createLocation} className="grid gap-4 sm:grid-cols-2" feedbackClassName="sm:col-span-2" resetOnSuccess successMessage="Location added.">
            <input name="companyId" type="hidden" value={companyId} />
            <LocationFields id={id} />
            <div className="flex justify-end sm:col-span-2"><button className={buttonStyles()}><MapPin size={16} /> Add location</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}

/** Edit and archive controls on one location row. */
export function LocationTools({ location }: { location: Location }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!location.isArchived && <button className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><Pencil size={14} /> Edit</button>}
      <ActionFeedbackForm action={setLocationArchived} className="flex flex-wrap items-center gap-2">
        <input name="locationId" type="hidden" value={location.id} />
        <input name="archived" type="hidden" value={location.isArchived ? "false" : "true"} />
        <button className={buttonStyles({ variant: "ghost", size: "sm" })}>{location.isArchived ? <><ArchiveRestore size={14} /> Restore</> : <><Archive size={14} /> Archive</>}</button>
      </ActionFeedbackForm>
      {isOpen && (
        <Modal eyebrow="CUSTOMER" onClose={() => setIsOpen(false)} title="Edit location">
          <ActionFeedbackForm action={updateLocation} className="grid gap-4 sm:grid-cols-2" feedbackClassName="sm:col-span-2">
            <input name="locationId" type="hidden" value={location.id} />
            <LocationFields id={id} location={location} />
            <div className="flex justify-end sm:col-span-2"><button className={buttonStyles()}>Save location</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </div>
  );
}

/** The "Invite someone" button and dialog: gives a person access to this customer's repairs and emails them how to sign in. */
export function InviteCustomerButton({ companyId, companyName, locations }: { companyId: string; companyName: string; locations: { id: string; name: string }[] }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setIsOpen(true)} type="button"><UserPlus size={15} /> Invite someone</button>
      {isOpen && (
        <Modal description={`They'll get an email with a link to the portal. They sign in with their email address and choose a password the first time; there's no request to approve.`} eyebrow="CUSTOMER ACCESS" onClose={() => setIsOpen(false)} title={`Invite someone from ${companyName}`}>
          <ActionFeedbackForm action={inviteCustomerUser} className="grid gap-4 sm:grid-cols-2" feedbackClassName="sm:col-span-2" resetOnSuccess>
            <input name="companyId" type="hidden" value={companyId} />
            <Field htmlFor={`${id}-first`} label="First name"><input autoComplete="off" className={fieldStyles} id={`${id}-first`} maxLength={100} name="firstName" required /></Field>
            <Field htmlFor={`${id}-last`} label="Last name"><input autoComplete="off" className={fieldStyles} id={`${id}-last`} maxLength={100} name="lastName" required /></Field>
            <Field className="sm:col-span-2" htmlFor={`${id}-email`} label="Work email"><input autoComplete="off" className={fieldStyles} id={`${id}-email`} maxLength={254} name="email" required type="email" /></Field>
            <Field className="sm:col-span-2" hint="Someone limited to one location sees only that location's pumps and repairs." htmlFor={`${id}-location`} label="Can see">
              <select className={fieldStyles} defaultValue="" id={`${id}-location`} name="locationId">
                <option value="">All of {companyName}&apos;s locations</option>
                {locations.map((location) => <option key={location.id} value={location.id}>Only {location.name}</option>)}
              </select>
            </Field>
            <div className="flex justify-end sm:col-span-2"><button className={buttonStyles()}><UserPlus size={16} /> Send invitation</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
