"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, ClipboardPlus, PackagePlus, Search, X } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { buttonStyles, fieldStyles, panelStyles } from "@/components/ui/styles";
import { ModelFields } from "@/features/catalog/components/model-fields";
import { openWorkOrder } from "@/features/work-orders/intake-actions";
import type { PumpResult } from "@/features/work-orders/pump-search";
import { copperClassificationLabels } from "@/lib/labels";

type Company = { id: string; name: string; locations: { id: string; name: string }[] };
type Option = { id: string; label: string };

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className={panelStyles}>
      <h2 className="flex items-center gap-3 text-lg font-bold"><span className="grid size-7 place-items-center rounded-full bg-ink text-sm text-white">{number}</span>{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function PumpSearch({ selected, onSelect }: { selected: PumpResult | null; onSelect: (pump: PumpResult | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PumpResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/internal/equipment/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (response.ok) setResults((await response.json()).results);
      } catch {
        // A newer search replaced this one, or the network dropped; the next keystroke retries.
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (selected) {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3 border-l-4 border-brand bg-surface px-4 py-3">
          <div>
            <p className="font-bold">{selected.productModel} · Serial {selected.serialNumber}</p>
            <p className="mt-0.5 text-sm text-muted">{selected.companyName}{selected.locationName && ` · ${selected.locationName}`}</p>
          </div>
          <button className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => onSelect(null)} type="button"><X size={15} /> Change pump</button>
        </div>
        {selected.openWorkOrder && (
          <p className="flex flex-wrap items-center gap-2 border-l-4 border-danger bg-danger-soft px-4 py-3 text-sm">
            <AlertTriangle className="text-danger" size={16} />
            This pump already has an open work order,
            <Link className="inline-flex items-center gap-1 font-bold text-danger" href={`/workspace/work-orders/${selected.openWorkOrder.id}`} target="_blank">{selected.openWorkOrder.workOrderNumber} <ArrowUpRight size={14} /></Link>.
            Check it isn&apos;t the same job before opening another.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="sr-only" htmlFor="pump-search">Search pumps</label>
      <div className="relative">
        <Search className="absolute left-3 top-3 text-muted" size={17} />
        <input autoComplete="off" autoFocus className={`${fieldStyles} pl-10`} id="pump-search" onChange={(event) => setQuery(event.target.value)} placeholder="Serial number, model, or customer" value={query} />
      </div>
      {query.trim().length >= 2 && (
        <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto border border-line bg-paper">
          {results.length ? results.map((pump) => (
            <li key={pump.id}>
              <button className="w-full px-4 py-3 text-left hover:bg-surface" onClick={() => onSelect(pump)} type="button">
                <span className="block font-bold">{pump.productModel} · Serial {pump.serialNumber}</span>
                <span className="block text-sm text-muted">{pump.companyName}{pump.locationName && ` · ${pump.locationName}`}{pump.openWorkOrder && ` · Open: ${pump.openWorkOrder.workOrderNumber}`}</span>
              </button>
            </li>
          )) : <li className="px-4 py-3 text-sm text-muted">{searching ? "Searching..." : "No pumps match. Add it as a new pump below."}</li>}
        </ul>
      )}
    </div>
  );
}

export function NewWorkOrderForm({ companies, models, serviceCenters, priorities, serviceTypes, nextNumber, initialPump = null }: {
  companies: Company[];
  models: Option[];
  serviceCenters: { id: string; code: string; name: string }[];
  priorities: Option[];
  serviceTypes: Option[];
  nextNumber: number;
  /** The pump to start with, when the form is opened from a pump's page. */
  initialPump?: PumpResult | null;
}) {
  const [pumpMode, setPumpMode] = useState<"existing" | "new">("existing");
  const [pump, setPump] = useState<PumpResult | null>(initialPump);
  const [companyId, setCompanyId] = useState("");
  const [centerId, setCenterId] = useState(serviceCenters.length === 1 ? serviceCenters[0].id : "");
  const locations = companies.find((company) => company.id === companyId)?.locations ?? [];
  const intake = pumpMode === "existing" ? pump?.lastIntake : null;
  const intakePrefilled = Boolean(intake && Object.entries(intake).some(([key, fieldValue]) => fieldValue && !(key === "copperClassification" && fieldValue === "UNKNOWN")));
  const previewNumber = String(nextNumber);

  return (
    <ActionFeedbackForm action={openWorkOrder} className="grid gap-6" successMessage="Work order opened.">
      <input name="pumpMode" type="hidden" value={pumpMode} />
      <Step number={1} title="Pump">
        <div className="mb-4 flex gap-2" role="group" aria-label="Pump">
          <button aria-pressed={pumpMode === "existing"} className={buttonStyles({ variant: pumpMode === "existing" ? "secondary" : "outline", size: "sm" })} onClick={() => setPumpMode("existing")} type="button"><Search size={15} /> Find a pump</button>
          <button aria-pressed={pumpMode === "new"} className={buttonStyles({ variant: pumpMode === "new" ? "secondary" : "outline", size: "sm" })} onClick={() => setPumpMode("new")} type="button"><PackagePlus size={15} /> New pump</button>
        </div>
        {pumpMode === "existing" ? (
          <>
            <input name="equipmentId" type="hidden" value={pump?.id ?? ""} />
            <PumpSearch onSelect={setPump} selected={pump} />
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field htmlFor="new-company" label="Customer">
              <select className={fieldStyles} id="new-company" name="companyId" onChange={(event) => setCompanyId(event.target.value)} required value={companyId}>
                <option value="">Choose customer</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field htmlFor="new-location" label="Location" optional>
              <select className={fieldStyles} disabled={!locations.length} id="new-location" key={companyId} name="locationId">
                <option value="">{companyId && !locations.length ? "No locations" : "Not specified"}</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </Field>
            <Field htmlFor="new-serial" label="Serial number"><input className={fieldStyles} id="new-serial" maxLength={120} name="serialNumber" required /></Field>
            <ModelFields models={models} />
          </div>
        )}
      </Step>

      <Step number={2} title="Job">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field hint="Assigned when you save. If someone else opens a job first, this one gets the next number." htmlFor="wip-number" label="WIP number">
            <output className={`${fieldStyles} block bg-surface font-bold`} id="wip-number">{previewNumber}</output>
          </Field>
          <Field htmlFor="service-center" label="Service center" optional={serviceCenters.length === 0}>
            <select className={fieldStyles} id="service-center" name="serviceCenterId" onChange={(event) => setCenterId(event.target.value)} required={serviceCenters.length > 0} value={centerId}>
              <option value="">{serviceCenters.length ? "Choose center" : "None set up yet"}</option>
              {serviceCenters.map((center) => <option key={center.id} value={center.id}>{center.code} · {center.name}</option>)}
            </select>
          </Field>
          <Field className="sm:col-span-2" htmlFor="summary" label="Summary"><textarea className={fieldStyles} id="summary" maxLength={500} name="summary" placeholder="Pump rebuild" required rows={2} /></Field>
          <Field htmlFor="priority" label="Priority" optional>
            <select className={fieldStyles} defaultValue={priorities[0]?.label ?? ""} id="priority" name="priority"><option value="">Not set</option>{priorities.map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}</select>
          </Field>
          <Field htmlFor="service-type" label="Service type" optional>
            <select className={fieldStyles} id="service-type" name="serviceType"><option value="">Not set</option>{serviceTypes.map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}</select>
          </Field>
          <Field htmlFor="po" label="Customer PO" optional><input className={fieldStyles} id="po" maxLength={80} name="customerPurchaseOrder" /></Field>
          <Field htmlFor="rma" label="RMA" optional><input className={fieldStyles} id="rma" maxLength={80} name="rmaReference" /></Field>
          <Field htmlFor="promised" label="Promised date" optional><input className={fieldStyles} id="promised" name="promisedAt" type="date" /></Field>
        </div>
      </Step>

      <Step number={3} title="Intake">
        {intakePrefilled && <p className="mb-4 text-sm text-muted">Filled in from this pump&apos;s last repair. Check each value is still right.</p>}
        <div className="grid gap-3 sm:grid-cols-2" key={pump?.id ?? pumpMode}>
          <Field htmlFor="tool-id" label="Tool ID" optional><input className={fieldStyles} defaultValue={intake?.toolId ?? ""} id="tool-id" maxLength={80} name="toolId" /></Field>
          <Field htmlFor="copper" label="Copper / non-copper">
            <select className={fieldStyles} defaultValue={intake?.copperClassification ?? "UNKNOWN"} id="copper" name="copperClassification">{Object.entries(copperClassificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </Field>
          <Field htmlFor="oil-type" label="Oil type" optional><input className={fieldStyles} defaultValue={intake?.oilType ?? ""} id="oil-type" maxLength={80} name="oilType" placeholder="Fomblin" /></Field>
          <Field htmlFor="oil-weight" label="Oil weight" optional><input className={fieldStyles} id="oil-weight" maxLength={40} name="oilWeight" placeholder="2.8 lb" /></Field>
          <Field className="sm:col-span-2" htmlFor="contaminants" label="Contaminants" optional><input className={fieldStyles} defaultValue={intake?.contaminants ?? ""} id="contaminants" maxLength={200} name="contaminants" placeholder="N2" /></Field>
          <Field className="sm:col-span-2" htmlFor="reason" label="Reason for service" optional><textarea className={fieldStyles} id="reason" maxLength={500} name="reasonForService" rows={2} /></Field>
          <Field className="sm:col-span-2" htmlFor="accessories" label="Accessories received" optional><input className={fieldStyles} id="accessories" maxLength={500} name="accessoriesReceived" /></Field>
          <Field htmlFor="contact-name" label="Customer contact" optional><input className={fieldStyles} defaultValue={intake?.customerContactName ?? ""} id="contact-name" maxLength={120} name="customerContactName" /></Field>
          <Field htmlFor="contact-phone" label="Contact phone" optional><input className={fieldStyles} defaultValue={intake?.customerContactPhone ?? ""} id="contact-phone" maxLength={40} name="customerContactPhone" type="tel" /></Field>
          <Field className="sm:col-span-2" htmlFor="contact-email" label="Contact email" optional><input className={fieldStyles} defaultValue={intake?.customerContactEmail ?? ""} id="contact-email" maxLength={254} name="customerContactEmail" type="email" /></Field>
        </div>
      </Step>

      <div className="flex justify-end">
        <button className={buttonStyles()}><ClipboardPlus size={16} /> Open work order</button>
      </div>
    </ActionFeedbackForm>
  );
}
