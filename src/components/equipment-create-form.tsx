"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { AlertTriangle, ArrowUpRight, PackagePlus } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { createEquipment } from "@/features/work-orders/actions";

type Company = { id: string; name: string };
type Location = { id: string; name: string; company: { name: string } };
type ExistingEquipment = { id: string; companyId: string; productModel: string; serialNumber: string; company: { name: string }; location: { name: string } | null };

export default function EquipmentCreateForm({ companies, locations, existingEquipment }: { companies: Company[]; locations: Location[]; existingEquipment: ExistingEquipment[] }) {
  const formId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [productModel, setProductModel] = useState("");
  const normalizedSerialNumber = serialNumber.trim().toLowerCase();
  const normalizedProductModel = productModel.trim().toLowerCase();
  const serialMatches = companyId && normalizedSerialNumber ? existingEquipment.filter((equipment) => equipment.companyId === companyId && equipment.serialNumber.toLowerCase() === normalizedSerialNumber) : [];
  const modelMatches = normalizedProductModel ? existingEquipment.filter((equipment) => equipment.productModel.toLowerCase() === normalizedProductModel).slice(0, 3) : [];

  return (
    <>
      <button className={buttonStyles({ size: "sm" })} onClick={() => setIsOpen(true)} type="button"><PackagePlus size={16} /> Add equipment</button>
      {isOpen && (
        <Modal eyebrow="EQUIPMENT REGISTER" title="Add equipment" description="Check the suggested records before creating a new service asset." onClose={() => setIsOpen(false)} size="lg">
          <ActionFeedbackForm action={createEquipment} className="grid gap-3 sm:grid-cols-2" successMessage="Equipment added.">
            <Field label="Customer company" htmlFor={`${formId}-company`}>
              <select className={fieldStyles} disabled={!companies.length} id={`${formId}-company`} name="companyId" onChange={(event) => setCompanyId(event.target.value)} required value={companyId}>
                <option value="">Select company</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Service location" htmlFor={`${formId}-location`} optional>
              <select className={fieldStyles} disabled={!locations.length} id={`${formId}-location`} name="locationId">
                <option value="">No location</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.company.name} · {location.name}</option>)}
              </select>
            </Field>
            <Field label="Product / model" htmlFor={`${formId}-model`}>
              <input className={fieldStyles} id={`${formId}-model`} name="productModel" onChange={(event) => setProductModel(event.target.value)} required value={productModel} />
            </Field>
            <Field label="Serial number" htmlFor={`${formId}-serial`}>
              <input className={fieldStyles} id={`${formId}-serial`} name="serialNumber" onChange={(event) => setSerialNumber(event.target.value)} required value={serialNumber} />
            </Field>
            <Field label="Description" htmlFor={`${formId}-description`} optional className="sm:col-span-2">
              <input className={fieldStyles} id={`${formId}-description`} name="description" />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <button className={buttonStyles()} disabled={!companies.length || Boolean(serialMatches.length)}><PackagePlus size={16} /> Add equipment</button>
            </div>
            {serialMatches.length > 0 && (
              <aside className="border-l-4 border-brand bg-danger-soft px-4 py-3 sm:col-span-2" role="status">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={18} />
                  <div>
                    <p className="font-bold">This serial number already exists for the selected company</p>
                    <p className="mt-1 text-sm text-muted">Open the existing equipment record instead of creating a duplicate.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {serialMatches.map((equipment) => (
                        <Link className="flex items-center gap-2 border border-brand bg-paper px-3 py-2 text-sm font-bold text-brand hover:bg-brand hover:text-white" href={`/workspace/equipment/${equipment.id}`} key={equipment.id}>
                          {equipment.productModel} · {equipment.serialNumber}{equipment.location && ` · ${equipment.location.name}`}<ArrowUpRight size={15} />
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>
            )}
            {serialMatches.length === 0 && modelMatches.length > 0 && (
              <aside className="border-l-4 border-line bg-surface px-4 py-3 sm:col-span-2" role="status">
                <p className="font-bold">This model is already in the equipment register</p>
                <p className="mt-1 text-sm text-muted">Models may be reused across customers. These records are shown for reference only.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {modelMatches.map((equipment) => (
                    <Link className="flex items-center gap-2 border border-line bg-paper px-3 py-2 text-sm font-bold text-body hover:border-brand hover:text-brand" href={`/workspace/equipment/${equipment.id}`} key={equipment.id}>
                      {equipment.company.name} · {equipment.serialNumber}<ArrowUpRight size={15} />
                    </Link>
                  ))}
                </div>
              </aside>
            )}
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
