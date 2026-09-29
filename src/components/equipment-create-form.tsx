"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { AlertTriangle, ArrowUpRight, PackagePlus, X } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { createEquipment } from "@/features/work-orders/actions";

type Company = { id: string; name: string };
type Location = { id: string; name: string; company: { name: string } };
type ExistingEquipment = { id: string; companyId: string; productModel: string; serialNumber: string; company: { name: string }; location: { name: string } | null };

const fieldClass = "w-full border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ea3435]";

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

  return <><button className="flex items-center gap-2 bg-[#ea3435] px-3 py-2.5 text-sm font-bold text-white hover:bg-[#c72028]" onClick={() => setIsOpen(true)} type="button"><PackagePlus size={16} /> Add equipment</button>{isOpen && <div className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-5" onMouseDown={() => setIsOpen(false)} role="presentation"><section aria-labelledby={`${formId}-title`} aria-modal="true" className="max-h-[calc(100vh-2.5rem)] w-full max-w-3xl overflow-y-auto border border-[#d9d9d9] bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()} role="dialog"><div className="flex items-start justify-between gap-5 border-b border-[#d9d9d9] pb-5"><div><p className="text-sm font-bold tracking-[0.1em] text-[#ea3435]">EQUIPMENT REGISTER</p><h2 className="mt-2 text-2xl font-bold" id={`${formId}-title`}>Add equipment</h2><p className="mt-2 text-sm text-[#5a5a5a]">Check the suggested records before creating a new service asset.</p></div><button aria-label="Close add equipment" className="grid size-10 shrink-0 place-items-center border border-[#d9d9d9] text-[#5a5a5a] hover:border-[#ea3435] hover:text-[#ea3435]" onClick={() => setIsOpen(false)} type="button"><X size={20} /></button></div><ActionFeedbackForm action={createEquipment} className="mt-6 grid gap-3 sm:grid-cols-2" successMessage="Equipment added.">
    <label className="sr-only" htmlFor={`${formId}-company`}>Customer company</label><select className={fieldClass} disabled={!companies.length} id={`${formId}-company`} name="companyId" onChange={(event) => setCompanyId(event.target.value)} required value={companyId}><option value="">Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
    <label className="sr-only" htmlFor={`${formId}-location`}>Service location</label><select className={fieldClass} disabled={!locations.length} id={`${formId}-location`} name="locationId"><option value="">No location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.company.name} · {location.name}</option>)}</select>
    <label className="sr-only" htmlFor={`${formId}-model`}>Product or model</label><input className={fieldClass} id={`${formId}-model`} name="productModel" onChange={(event) => setProductModel(event.target.value)} placeholder="Product / model" required value={productModel} />
    <label className="sr-only" htmlFor={`${formId}-serial`}>Serial number</label><input className={fieldClass} id={`${formId}-serial`} name="serialNumber" onChange={(event) => setSerialNumber(event.target.value)} placeholder="Serial number" required value={serialNumber} />
    <input className={`sm:col-span-2 ${fieldClass}`} name="description" placeholder="Description" />
    <div className="flex justify-end sm:col-span-2"><button className="flex items-center justify-center gap-2 bg-[#ea3435] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40" disabled={!companies.length || Boolean(serialMatches.length)}><PackagePlus size={16} /> Add equipment</button></div>
    {serialMatches.length > 0 && <aside className="basis-full border-l-4 border-[#ea3435] bg-[#fff4f4] px-4 py-3" role="status"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-[#b42318]" size={18} /><div><p className="font-bold">This serial number already exists for the selected company</p><p className="mt-1 text-sm text-[#5a5a5a]">Open the existing equipment record instead of creating a duplicate.</p><div className="mt-3 flex flex-wrap gap-2">{serialMatches.map((equipment) => <Link className="flex items-center gap-2 border border-[#ea3435] bg-white px-3 py-2 text-sm font-bold text-[#ea3435] hover:bg-[#ea3435] hover:text-white" href={`/workspace/equipment/${equipment.id}`} key={equipment.id}>{equipment.productModel} · {equipment.serialNumber}{equipment.location && ` · ${equipment.location.name}`}<ArrowUpRight size={15} /></Link>)}</div></div></div></aside>}
    {serialMatches.length === 0 && modelMatches.length > 0 && <aside className="basis-full border-l-4 border-[#d9d9d9] bg-[#f6f6f6] px-4 py-3" role="status"><p className="font-bold">This model is already in the equipment register</p><p className="mt-1 text-sm text-[#5a5a5a]">Models may be reused across customers. These records are shown for reference only.</p><div className="mt-3 flex flex-wrap gap-2">{modelMatches.map((equipment) => <Link className="flex items-center gap-2 border border-[#d9d9d9] bg-white px-3 py-2 text-sm font-bold text-[#333333] hover:border-[#ea3435] hover:text-[#ea3435]" href={`/workspace/equipment/${equipment.id}`} key={equipment.id}>{equipment.company.name} · {equipment.serialNumber}<ArrowUpRight size={15} /></Link>)}</div></aside>}
  </ActionFeedbackForm></section></div>}</>;
}