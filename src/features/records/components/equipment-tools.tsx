"use client";

import { useEffect, useId, useState } from "react";
import { Archive, ArchiveRestore, Combine, Pencil, Search, X } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { ModelFields, type ModelOption } from "@/features/catalog/components/model-fields";
import { mergeEquipment, setEquipmentArchived, updateEquipment } from "@/features/records/actions";

type Pump = { id: string; companyId: string; productModelId: string | null; productModel: string; serialNumber: string; description: string | null; locationId: string | null; isArchived: boolean };
type PumpMatch = { id: string; productModel: string; serialNumber: string; locationName: string | null };

/** Finds the pump to keep, among the same customer's other pumps. */
function KeepPumpPicker({ pump }: { pump: Pump }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PumpMatch[]>([]);
  const [selected, setSelected] = useState<PumpMatch | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/internal/equipment/search?q=${encodeURIComponent(query.trim())}&companyId=${pump.companyId}&exclude=${pump.id}`, { signal: controller.signal });
        if (response.ok) setResults((await response.json()).results);
      } catch {
        // A newer search replaced this one, or the network dropped; the next keystroke retries.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, pump.companyId, pump.id]);

  return (
    <div>
      <input name="keepId" type="hidden" value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-l-4 border-brand bg-surface px-4 py-3">
          <p><span className="font-bold">{selected.productModel} · Serial {selected.serialNumber}</span>{selected.locationName && <span className="block text-sm text-muted">{selected.locationName}</span>}</p>
          <button className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => setSelected(null)} type="button"><X size={15} /> Change</button>
        </div>
      ) : (
        <>
          <label className="sr-only" htmlFor="keep-pump-search">Search this customer&apos;s pumps</label>
          <div className="relative">
            <Search className="absolute left-3 top-3 text-muted" size={17} />
            <input autoComplete="off" className={`${fieldStyles} pl-10`} id="keep-pump-search" onChange={(event) => setQuery(event.target.value)} placeholder="Serial number or model" value={query} />
          </div>
          {query.trim().length >= 2 && (
            <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto border border-line bg-paper">
              {results.length ? results.map((match) => (
                <li key={match.id}>
                  <button className="w-full px-4 py-3 text-left hover:bg-surface" onClick={() => setSelected(match)} type="button">
                    <span className="block font-bold">{match.productModel} · Serial {match.serialNumber}</span>
                    {match.locationName && <span className="block text-sm text-muted">{match.locationName}</span>}
                  </button>
                </li>
              )) : <li className="px-4 py-3 text-sm text-muted">No other pumps for this customer match.</li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Edit, merge and archive controls for a pump. Merging and archiving are for managers. */
export function EquipmentTools({ pump, models, locations, workOrderCount, canManage }: {
  pump: Pump;
  models: ModelOption[];
  locations: { id: string; name: string }[];
  workOrderCount: number;
  canManage: boolean;
}) {
  const id = useId();
  const [dialog, setDialog] = useState<"edit" | "merge" | null>(null);
  const close = () => setDialog(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!pump.isArchived && <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setDialog("edit")} type="button"><Pencil size={15} /> Edit</button>}
        {canManage && !pump.isArchived && <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setDialog("merge")} type="button"><Combine size={15} /> Merge duplicate</button>}
        {canManage && (
          <ActionFeedbackForm action={setEquipmentArchived} className="flex flex-wrap items-center gap-2" feedbackClassName="max-w-xs">
            <input name="equipmentId" type="hidden" value={pump.id} />
            <input name="archived" type="hidden" value={pump.isArchived ? "false" : "true"} />
            <button className={buttonStyles({ variant: "outline", size: "sm" })}>{pump.isArchived ? <><ArchiveRestore size={15} /> Restore</> : <><Archive size={15} /> Archive</>}</button>
          </ActionFeedbackForm>
        )}
      </div>

      {dialog === "edit" && (
        <Modal description="Corrections are recorded in the audit log. To move a pump to another customer, merge the customers or add it there." eyebrow="PUMP" onClose={close} title="Edit pump">
          <ActionFeedbackForm action={updateEquipment} className="grid gap-4 sm:grid-cols-2" feedbackClassName="sm:col-span-2">
            <input name="equipmentId" type="hidden" value={pump.id} />
            <ModelFields defaultModelId={pump.productModelId ?? ""} models={models} />
            <Field htmlFor={`${id}-serial`} label="Serial number"><input className={fieldStyles} defaultValue={pump.serialNumber} id={`${id}-serial`} maxLength={120} name="serialNumber" required /></Field>
            <Field htmlFor={`${id}-location`} label="Location" optional>
              <select className={fieldStyles} defaultValue={pump.locationId ?? ""} id={`${id}-location`} name="locationId">
                <option value="">Not specified</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </Field>
            <Field className="sm:col-span-2" htmlFor={`${id}-description`} label="Description" optional><input className={fieldStyles} defaultValue={pump.description ?? ""} id={`${id}-description`} maxLength={500} name="description" /></Field>
            {!pump.productModelId && <p className="text-sm text-muted sm:col-span-2">This pump was recorded as &ldquo;{pump.productModel}&rdquo; before the model catalog existed. Choose its catalog model to link it.</p>}
            <div className="flex justify-end sm:col-span-2"><button className={buttonStyles()}>Save pump</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}

      {dialog === "merge" && (
        <Modal description="Use this when the same pump was entered twice, for example with a mistyped serial number." eyebrow="PUMP" onClose={close} title="Merge duplicate pump">
          <ActionFeedbackForm action={mergeEquipment} className="grid gap-5">
            <input name="duplicateId" type="hidden" value={pump.id} />
            <div className="border-l-4 border-line bg-surface px-4 py-3 text-sm">
              <p className="font-bold">This record will be merged away</p>
              <p className="mt-1 text-muted">{pump.productModel} · Serial {pump.serialNumber} · {workOrderCount} work order{workOrderCount === 1 ? "" : "s"}</p>
            </div>
            <div className="grid gap-1.5 text-sm font-bold">
              <span>Pump to keep</span>
              <KeepPumpPicker pump={pump} />
            </div>
            <p className="text-sm text-muted">This pump&apos;s work orders, photos and documents move to the pump you keep, and this record is archived. A merge can&apos;t be undone.</p>
            <div className="flex justify-end gap-2">
              <button className={buttonStyles({ variant: "outline" })} onClick={close} type="button">Cancel</button>
              <button className={buttonStyles({ variant: "danger" })}><Combine size={16} /> Merge into the pump above</button>
            </div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
