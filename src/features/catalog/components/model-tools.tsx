"use client";

import { useId, useState } from "react";
import { Combine, Pencil, Plus, Trash2, Upload } from "lucide-react";
import type { DocumentType, RecordVisibility } from "@prisma/client";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { deleteModelDocument, mergeProductModels, saveProductModel, updateModelDocument, uploadModelDocument } from "@/features/catalog/actions";
import type { ModelOption } from "@/features/catalog/components/model-fields";
import { documentTypeLabels } from "@/lib/labels";

type Model = { id: string; manufacturer: string | null; name: string; isActive: boolean };

/** Document types that make sense for a whole model, as opposed to one repair. */
const modelDocumentTypes: DocumentType[] = ["MANUAL", "WARRANTY_CERTIFICATE", "OTHER"];

function ModelNameFields({ id, model }: { id: string; model?: Model }) {
  return (
    <>
      <Field htmlFor={`${id}-manufacturer`} label="Manufacturer" optional><input className={fieldStyles} defaultValue={model?.manufacturer ?? ""} id={`${id}-manufacturer`} maxLength={80} name="manufacturer" placeholder="Edwards" /></Field>
      <Field htmlFor={`${id}-name`} label="Model name"><input className={fieldStyles} defaultValue={model?.name ?? ""} id={`${id}-name`} maxLength={120} name="name" placeholder="IL70N" required /></Field>
    </>
  );
}

/** The "Add model" button and dialog on the catalog list. */
export function AddModelButton() {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className={buttonStyles({ size: "sm" })} onClick={() => setIsOpen(true)} type="button"><Plus size={16} /> Add model</button>
      {isOpen && (
        <Modal description="Models can also be added while entering a pump. Add one here to attach its manuals in advance." eyebrow="MODEL CATALOG" onClose={() => setIsOpen(false)} size="sm" title="Add model">
          <ActionFeedbackForm action={saveProductModel} className="grid gap-4" resetOnSuccess>
            <ModelNameFields id={id} />
            <div className="flex justify-end"><button className={buttonStyles()}><Plus size={16} /> Add model</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}

/** Edit and merge controls for a catalog model. */
export function ModelTools({ model, otherModels, pumpCount }: { model: Model; otherModels: ModelOption[]; pumpCount: number }) {
  const id = useId();
  const [dialog, setDialog] = useState<"edit" | "merge" | null>(null);
  const close = () => setDialog(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setDialog("edit")} type="button"><Pencil size={15} /> Edit</button>
        <button className={buttonStyles({ variant: "outline", size: "sm" })} disabled={!otherModels.length} onClick={() => setDialog("merge")} type="button"><Combine size={15} /> Merge duplicate</button>
      </div>

      {dialog === "edit" && (
        <Modal description="A corrected name is applied to every pump of this model." eyebrow="MODEL CATALOG" onClose={close} size="sm" title="Edit model">
          <ActionFeedbackForm action={saveProductModel} className="grid gap-4">
            <input name="modelId" type="hidden" value={model.id} />
            <input name="isActiveField" type="hidden" value="1" />
            <ModelNameFields id={id} model={model} />
            <label className="flex items-start gap-2 text-sm"><input className="mt-0.5 size-4 accent-brand" defaultChecked={model.isActive} name="isActive" type="checkbox" /><span><span className="font-bold">Offer this model when adding pumps</span><span className="block text-muted">Untick to retire a model that&apos;s no longer serviced. Existing pumps keep it.</span></span></label>
            <div className="flex justify-end"><button className={buttonStyles()}>Save model</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}

      {dialog === "merge" && (
        <Modal description="Use this when the same model is in the catalog twice, for example as “R5” and “Busch R5”." eyebrow="MODEL CATALOG" onClose={close} title="Merge duplicate model">
          <ActionFeedbackForm action={mergeProductModels} className="grid gap-5">
            <input name="duplicateId" type="hidden" value={model.id} />
            <input name="redirect" type="hidden" value="1" />
            <div className="border-l-4 border-line bg-surface px-4 py-3 text-sm">
              <p className="font-bold">This entry will be merged away</p>
              <p className="mt-1 text-muted">{[model.manufacturer, model.name].filter(Boolean).join(" ")} · {pumpCount} pump{pumpCount === 1 ? "" : "s"}</p>
            </div>
            <Field htmlFor={`${id}-keep`} label="Model to keep">
              <select className={fieldStyles} defaultValue="" id={`${id}-keep`} name="keepId" required>
                <option value="">Choose model</option>
                {otherModels.map((other) => <option key={other.id} value={other.id}>{other.label}</option>)}
              </select>
            </Field>
            <p className="text-sm text-muted">This entry&apos;s pumps and documents move to the model you keep, and this entry is removed from the catalog. A merge can&apos;t be undone.</p>
            <div className="flex justify-end gap-2">
              <button className={buttonStyles({ variant: "outline" })} onClick={close} type="button">Cancel</button>
              <button className={buttonStyles({ variant: "danger" })}><Combine size={16} /> Merge into the model above</button>
            </div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}

function VisibilitySelect({ id, defaultValue }: { id: string; defaultValue: RecordVisibility }) {
  return (
    <select className={fieldStyles} defaultValue={defaultValue} id={id} name="visibility">
      <option value="INTERNAL_ONLY">Staff only</option>
      <option value="CUSTOMER_VISIBLE">Staff and customers with this model</option>
    </select>
  );
}

/** Uploads a manual or other document for a model. */
export function ModelDocumentUpload({ modelId }: { modelId: string }) {
  const id = useId();
  return (
    <ActionFeedbackForm action={uploadModelDocument} className="grid gap-3 sm:grid-cols-2" feedbackClassName="sm:col-span-2" resetOnSuccess>
      <input name="modelId" type="hidden" value={modelId} />
      <Field className="sm:col-span-2" hint="PDF, Word, Excel, PowerPoint, text or image files, up to 50 MB." htmlFor={`${id}-file`} label="File">
        <input className={`${fieldStyles} file:mr-3 file:border-0 file:bg-surface file:px-3 file:py-1 file:text-sm file:font-bold`} id={`${id}-file`} name="file" required type="file" />
      </Field>
      <Field className="sm:col-span-2" hint="Leave blank to use the file name." htmlFor={`${id}-title`} label="Title" optional><input className={fieldStyles} id={`${id}-title`} maxLength={160} name="title" placeholder="Operating manual" /></Field>
      <Field htmlFor={`${id}-type`} label="Type">
        <select className={fieldStyles} defaultValue="MANUAL" id={`${id}-type`} name="documentType">
          {modelDocumentTypes.map((type) => <option key={type} value={type}>{documentTypeLabels[type]}</option>)}
        </select>
      </Field>
      <Field htmlFor={`${id}-visibility`} label="Who can see it"><VisibilitySelect defaultValue="INTERNAL_ONLY" id={`${id}-visibility`} /></Field>
      <div className="flex justify-end sm:col-span-2"><button className={buttonStyles({ size: "sm" })}><Upload size={15} /> Upload document</button></div>
    </ActionFeedbackForm>
  );
}

/** Rename, visibility and delete controls on one model document. */
export function ModelDocumentTools({ document }: { document: { id: string; title: string; visibility: RecordVisibility } }) {
  const id = useId();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const close = () => setDialog(null);
  return (
    <div className="flex items-center gap-1">
      <button aria-label={`Edit ${document.title}`} className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => setDialog("edit")} type="button"><Pencil size={14} /> Edit</button>
      <button aria-label={`Delete ${document.title}`} className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => setDialog("delete")} type="button"><Trash2 size={14} /> Delete</button>
      {dialog === "edit" && (
        <Modal eyebrow="MODEL DOCUMENT" onClose={close} size="sm" title="Edit document">
          <ActionFeedbackForm action={updateModelDocument} className="grid gap-4">
            <input name="documentId" type="hidden" value={document.id} />
            <Field htmlFor={`${id}-title`} label="Title"><input className={fieldStyles} defaultValue={document.title} id={`${id}-title`} maxLength={160} name="title" required /></Field>
            <Field htmlFor={`${id}-visibility`} label="Who can see it"><VisibilitySelect defaultValue={document.visibility} id={`${id}-visibility`} /></Field>
            <div className="flex justify-end"><button className={buttonStyles()}>Save document</button></div>
          </ActionFeedbackForm>
        </Modal>
      )}
      {dialog === "delete" && (
        <Modal description="The file is removed for every pump of this model. This can't be undone." eyebrow="MODEL DOCUMENT" onClose={close} size="sm" title={`Delete “${document.title}”?`}>
          <ActionFeedbackForm action={deleteModelDocument} className="flex flex-wrap justify-end gap-2">
            <input name="documentId" type="hidden" value={document.id} />
            <button className={buttonStyles({ variant: "outline" })} onClick={close} type="button">Cancel</button>
            <button className={buttonStyles({ variant: "danger" })}><Trash2 size={16} /> Delete document</button>
          </ActionFeedbackForm>
        </Modal>
      )}
    </div>
  );
}
