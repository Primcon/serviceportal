"use client";

import { useId, useState } from "react";
import { Field } from "@/components/ui/field";
import { fieldStyles } from "@/components/ui/styles";

export type ModelOption = { id: string; label: string };

/**
 * The catalog model picker used wherever a pump is added or edited. Choosing "Model not
 * listed" reveals fields for a new manufacturer and model, which the action adds to the catalog.
 */
export function ModelFields({ models, defaultModelId = "" }: { models: ModelOption[]; defaultModelId?: string }) {
  const id = useId();
  const [modelId, setModelId] = useState(defaultModelId);
  return (
    <>
      <Field htmlFor={`${id}-model`} label="Model">
        <select className={fieldStyles} id={`${id}-model`} name="productModelId" onChange={(event) => setModelId(event.target.value)} value={modelId}>
          <option value="">Choose model</option>
          {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          <option value="__new">+ Model not listed</option>
        </select>
      </Field>
      {modelId === "__new" && (
        <>
          <Field htmlFor={`${id}-manufacturer`} label="Manufacturer" optional><input className={fieldStyles} id={`${id}-manufacturer`} maxLength={80} name="newManufacturer" placeholder="Edwards" /></Field>
          <Field htmlFor={`${id}-model-name`} label="Model name"><input className={fieldStyles} id={`${id}-model-name`} maxLength={120} name="newModelName" placeholder="IL70N" required /></Field>
        </>
      )}
    </>
  );
}
