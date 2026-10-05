"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { AlertTriangle, ArrowUpRight, PackagePlus } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { ModelFields, type ModelOption } from "@/features/catalog/components/model-fields";
import { createEquipment } from "@/features/work-orders/actions";

type Company = { id: string; name: string; locations: { id: string; name: string }[] };
type SerialMatch = { id: string; productModel: string; serialNumber: string; locationName: string | null };

/** Asks the server whether the customer already has a pump with this serial number. */
function useSerialMatches(companyId: string, serialNumber: string) {
  const [matches, setMatches] = useState<{ key: string; pumps: SerialMatch[] }>({ key: "", pumps: [] });
  const serial = serialNumber.trim();
  const key = companyId && serial ? `${companyId}:${serial.toLowerCase()}` : "";

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/internal/equipment/search?companyId=${companyId}&serial=${encodeURIComponent(serial)}`, { signal: controller.signal });
        if (response.ok) setMatches({ key, pumps: (await response.json()).results });
      } catch {
        // A newer check replaced this one, or the network dropped. The server checks again on save.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, companyId, serial]);

  // Results for an earlier customer or serial are ignored.
  return matches.key === key ? matches.pumps : [];
}

export default function EquipmentCreateForm({ companies, models, defaultCompanyId = "" }: { companies: Company[]; models: ModelOption[]; defaultCompanyId?: string }) {
  const formId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [serialNumber, setSerialNumber] = useState("");
  const locations = companies.find((company) => company.id === companyId)?.locations ?? [];
  const serialMatches = useSerialMatches(companyId, serialNumber);

  return (
    <>
      <button className={buttonStyles({ size: "sm" })} onClick={() => setIsOpen(true)} type="button"><PackagePlus size={16} /> Add pump</button>
      {isOpen && (
        <Modal description="Add a pump to a customer's register. When a pump arrives for repair, opening a work order can add it in the same step." eyebrow="EQUIPMENT REGISTER" onClose={() => setIsOpen(false)} size="lg" title="Add pump">
          <ActionFeedbackForm action={createEquipment} className="grid gap-3 sm:grid-cols-2" feedbackClassName="sm:col-span-2" successMessage="Pump added.">
            <Field htmlFor={`${formId}-company`} label="Customer">
              <select className={fieldStyles} disabled={!companies.length} id={`${formId}-company`} name="companyId" onChange={(event) => setCompanyId(event.target.value)} required value={companyId}>
                <option value="">Choose customer</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field htmlFor={`${formId}-location`} label="Location" optional>
              <select className={fieldStyles} disabled={!locations.length} id={`${formId}-location`} key={companyId} name="locationId">
                <option value="">{companyId && !locations.length ? "No locations" : "Not specified"}</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </Field>
            <Field htmlFor={`${formId}-serial`} label="Serial number">
              <input className={fieldStyles} id={`${formId}-serial`} maxLength={120} name="serialNumber" onChange={(event) => setSerialNumber(event.target.value)} required value={serialNumber} />
            </Field>
            <ModelFields models={models} />
            <Field className="sm:col-span-2" htmlFor={`${formId}-description`} label="Description" optional>
              <input className={fieldStyles} id={`${formId}-description`} maxLength={500} name="description" />
            </Field>
            {serialMatches.length > 0 && (
              <aside className="border-l-4 border-danger bg-danger-soft px-4 py-3 sm:col-span-2" role="status">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={18} />
                  <div>
                    <p className="font-bold">This customer already has a pump with that serial number</p>
                    <p className="mt-1 text-sm text-muted">Open the existing record instead of adding it again.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {serialMatches.map((pump) => (
                        <Link className="flex items-center gap-2 border border-danger bg-paper px-3 py-2 text-sm font-bold text-danger hover:bg-danger hover:text-white" href={`/workspace/equipment/${pump.id}`} key={pump.id}>
                          {pump.productModel} · {pump.serialNumber}{pump.locationName && ` · ${pump.locationName}`}<ArrowUpRight size={15} />
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>
            )}
            <div className="flex justify-end sm:col-span-2">
              <button className={buttonStyles()} disabled={!companies.length || serialMatches.length > 0}><PackagePlus size={16} /> Add pump</button>
            </div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
