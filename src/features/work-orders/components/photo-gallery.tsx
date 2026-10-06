"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, EyeOff, Trash2 } from "lucide-react";
import type { PhotoCategory, RecordVisibility } from "@prisma/client";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { PhotoUploader } from "@/features/work-orders/components/photo-uploader";
import { deletePhoto, updatePhoto } from "@/features/work-orders/record-actions";
import { photoCategoryLabels } from "@/lib/labels";

export type GalleryPhoto = {
  id: string;
  fileName: string;
  caption: string | null;
  photoCategory: PhotoCategory | null;
  visibility: RecordVisibility;
  /** When it was uploaded, already formatted in the shop's time zone. */
  uploadedOn: string;
  uploadedBy: string;
  canDelete: boolean;
};

const categories = Object.keys(photoCategoryLabels) as PhotoCategory[];

type OriginalState = "unknown" | "checking" | "available" | "retrieving" | "archived" | "error";

/**
 * The full-size original of a photo. Originals are kept in archive storage, so the first
 * step is to ask for one; it's ready within about 15 hours and stays available for a week.
 */
function OriginalPhoto({ photo }: { photo: GalleryPhoto }) {
  const [state, setState] = useState<OriginalState>("unknown");

  async function check(method: "GET" | "POST") {
    setState("checking");
    try {
      const response = await fetch(`/api/internal/attachments/${photo.id}/original`, { method });
      const result = await response.json() as { state?: OriginalState };
      setState(response.ok && result.state ? result.state : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "unknown") return <button className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => check("GET")} type="button"><Download size={15} /> Full-size original</button>;
  if (state === "checking") return <p className="text-sm text-muted">Checking...</p>;
  if (state === "available") return <a className={buttonStyles({ variant: "ghost", size: "sm" })} download={photo.fileName} href={`/api/internal/attachments/${photo.id}?variant=original`}><Download size={15} /> Download original ({photo.fileName})</a>;
  if (state === "retrieving") return <p className="max-w-sm text-sm text-muted">The original is being retrieved from archive storage. It can take up to 15 hours; check back here later.</p>;
  if (state === "archived") {
    return (
      <div className="flex max-w-md flex-wrap items-center gap-2 text-sm text-muted">
        <span>The original is in archive storage. Retrieving it takes up to 15 hours.</span>
        <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => check("POST")} type="button">Request original</button>
      </div>
    );
  }
  return <p className="text-sm text-danger">The original couldn&apos;t be checked. <button className="font-bold underline" onClick={() => check("GET")} type="button">Try again</button></p>;
}

function PhotoViewer({ photos, index, onNavigate, onClose }: { photos: GalleryPhoto[]; index: number; onNavigate: (index: number) => void; onClose: () => void }) {
  const photo = photos[index];
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (event.key === "ArrowRight" && index < photos.length - 1) onNavigate(index + 1);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [index, onNavigate, photos.length]);

  return (
    <Modal description={`${index + 1} of ${photos.length} · ${photo.uploadedBy} · ${photo.uploadedOn}`} onClose={onClose} size="lg" title={photo.caption || photo.fileName}>
      <div className="relative bg-ink">
        <Image alt={photo.caption || photo.fileName} className="mx-auto max-h-[60vh] w-auto object-contain" height={1200} key={photo.id} src={`/api/internal/attachments/${photo.id}?variant=optimized`} unoptimized width={1600} />
        {index > 0 && <button aria-label="Previous photo" className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center bg-paper/90 text-ink hover:text-brand" onClick={() => onNavigate(index - 1)} type="button"><ChevronLeft size={22} /></button>}
        {index < photos.length - 1 && <button aria-label="Next photo" className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center bg-paper/90 text-ink hover:text-brand" onClick={() => onNavigate(index + 1)} type="button"><ChevronRight size={22} /></button>}
      </div>

      <ActionFeedbackForm action={updatePhoto} className="mt-5 grid gap-3 sm:grid-cols-2" feedbackClassName="sm:col-span-2" key={photo.id} successMessage="Photo saved.">
        <input name="attachmentId" type="hidden" value={photo.id} />
        <Field className="sm:col-span-2" htmlFor="photo-caption" label="Caption" optional>
          <input className={fieldStyles} defaultValue={photo.caption ?? ""} id="photo-caption" maxLength={300} name="caption" placeholder="Scoring on the inlet stage rotor" />
        </Field>
        <Field htmlFor="photo-edit-category" label="Category">
          <select className={fieldStyles} defaultValue={photo.photoCategory ?? "INSPECTION"} id="photo-edit-category" name="photoCategory">{categories.map((category) => <option key={category} value={category}>{photoCategoryLabels[category]}</option>)}</select>
        </Field>
        <Field htmlFor="photo-edit-visibility" label="Who can see it">
          <select className={fieldStyles} defaultValue={photo.visibility} id="photo-edit-visibility" name="visibility"><option value="CUSTOMER_VISIBLE">Customer and staff</option><option value="INTERNAL_ONLY">Staff only</option></select>
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
          <OriginalPhoto key={photo.id} photo={photo} />
          <button className={buttonStyles({ size: "sm" })}>Save</button>
        </div>
      </ActionFeedbackForm>

      {photo.canDelete && (
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-line pt-4">
          {confirmingDelete ? (
            <ActionFeedbackForm action={deletePhoto} className="flex flex-wrap items-center gap-3" successMessage="Photo deleted.">
              <input name="attachmentId" type="hidden" value={photo.id} />
              <span className="text-sm text-danger">Delete this photo permanently?</span>
              <button className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => setConfirmingDelete(false)} type="button">Cancel</button>
              <button className={buttonStyles({ variant: "danger", size: "sm" })}>Delete photo</button>
            </ActionFeedbackForm>
          ) : (
            <button className={buttonStyles({ variant: "ghost", size: "sm", className: "text-danger" })} onClick={() => setConfirmingDelete(true)} type="button"><Trash2 size={15} /> Delete</button>
          )}
        </div>
      )}
    </Modal>
  );
}

export function PhotoGallery({ workOrderId, photos, initialPhotoId }: { workOrderId: string; photos: GalleryPhoto[]; initialPhotoId?: string }) {
  const [category, setCategory] = useState<PhotoCategory | "ALL">("ALL");
  const visible = category === "ALL" ? photos : photos.filter((photo) => photo.photoCategory === category);
  const [openIndex, setOpenIndex] = useState<number | null>(() => {
    const index = initialPhotoId ? photos.findIndex((photo) => photo.id === initialPhotoId) : -1;
    return index >= 0 ? index : null;
  });
  const presentCategories = categories.filter((item) => photos.some((photo) => photo.photoCategory === item));
  const viewerPhotos = openIndex !== null && category !== "ALL" ? visible : photos;

  return (
    <div className="grid gap-5">
      <PhotoUploader workOrderId={workOrderId} />
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter photos by category">
          {(["ALL", ...presentCategories] as const).map((item) => {
            const count = item === "ALL" ? photos.length : photos.filter((photo) => photo.photoCategory === item).length;
            return (
              <button aria-pressed={category === item} className={`border px-3 py-1.5 text-sm font-bold ${category === item ? "border-brand bg-brand-soft text-ink" : "border-line text-muted hover:border-brand hover:text-brand"}`} key={item} onClick={() => setCategory(item)} type="button">
                {item === "ALL" ? "All" : photoCategoryLabels[item]} <span className="font-normal">({count})</span>
              </button>
            );
          })}
        </div>
      )}
      {visible.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((photo) => (
            <li key={photo.id}>
              <button className="group block w-full text-left" onClick={() => setOpenIndex((category === "ALL" ? photos : visible).indexOf(photo))} type="button">
                <span className="relative block aspect-square overflow-hidden border border-line bg-surface group-hover:border-brand">
                  <Image alt={photo.caption || photo.fileName} className="size-full object-cover" height={480} src={`/api/internal/attachments/${photo.id}?variant=thumbnail`} unoptimized width={480} />
                  {photo.visibility === "INTERNAL_ONLY" && <span className="absolute left-1.5 top-1.5 flex items-center gap-1 bg-ink/80 px-1.5 py-0.5 text-[11px] font-bold text-white"><EyeOff size={11} /> Staff only</span>}
                </span>
                <span className="mt-1.5 block truncate text-xs text-muted">{photo.caption || (photo.photoCategory ? photoCategoryLabels[photo.photoCategory] : photo.fileName)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{photos.length ? "No photos in this category." : "No photos yet. Take or choose photos above."}</p>
      )}
      {openIndex !== null && viewerPhotos[openIndex] && (
        <PhotoViewer index={openIndex} onClose={() => setOpenIndex(null)} onNavigate={setOpenIndex} photos={viewerPhotos} />
      )}
    </div>
  );
}
