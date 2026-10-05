"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, CircleAlert, CircleCheck, ImagePlus, RotateCw, X } from "lucide-react";
import type { PhotoCategory, RecordVisibility } from "@prisma/client";
import { Field } from "@/components/ui/field";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { photoCategoryLabels } from "@/lib/labels";

type Upload = {
  id: number;
  file: File;
  photoCategory: PhotoCategory;
  visibility: RecordVisibility;
  status: "waiting" | "uploading" | "done" | "failed";
  error?: string;
};

const categories = Object.keys(photoCategoryLabels) as PhotoCategory[];
/** Photos sent at once. More than a few competes with itself on shop Wi-Fi and gains nothing. */
const parallelUploads = 3;
const maxPhotoBytes = 40 * 1024 * 1024;
const maxPhotosPerSelection = 200;

async function send(workOrderId: string, upload: Upload): Promise<Pick<Upload, "status" | "error">> {
  const body = new FormData();
  body.set("file", upload.file);
  body.set("photoCategory", upload.photoCategory);
  body.set("visibility", upload.visibility);
  try {
    const response = await fetch(`/api/internal/work-orders/${workOrderId}/photos`, { method: "POST", body });
    const result = await response.json().catch(() => null) as { status?: string; message?: string } | null;
    if (response.ok && result?.status === "success") return { status: "done" };
    return { status: "failed", error: result?.message ?? "The photo couldn't be saved." };
  } catch {
    return { status: "failed", error: "The portal couldn't be reached. Check your connection." };
  }
}

/**
 * Takes or chooses photos and uploads them one at a time, a few in parallel. Uploading
 * starts as soon as photos are chosen; each photo succeeds or fails on its own and a failed
 * one can be retried without sending the rest again.
 */
export function PhotoUploader({ workOrderId }: { workOrderId: string }) {
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [photoCategory, setPhotoCategory] = useState<PhotoCategory>("INSPECTION");
  const [visibility, setVisibility] = useState<RecordVisibility>("CUSTOMER_VISIBLE");
  const [notice, setNotice] = useState("");
  const waiting = useRef<Upload[]>([]);
  const active = useRef(0);
  const nextId = useRef(1);

  const update = (id: number, change: Partial<Upload>) => setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, ...change } : upload)));

  function pump() {
    while (active.current < parallelUploads && waiting.current.length) {
      const upload = waiting.current.shift()!;
      active.current += 1;
      update(upload.id, { status: "uploading", error: undefined });
      void send(workOrderId, upload).then((result) => {
        update(upload.id, result);
        active.current -= 1;
        // Show the new photos once the batch settles, rather than reloading after each one.
        if (!active.current && !waiting.current.length) router.refresh();
        pump();
      });
    }
  }

  function add(files: FileList | null) {
    const chosen = [...(files ?? [])];
    if (!chosen.length) return;
    setNotice(chosen.length > maxPhotosPerSelection ? `Only the first ${maxPhotosPerSelection} photos were added. Choose the rest once these finish.` : "");
    const added = chosen.slice(0, maxPhotosPerSelection).map((file): Upload => {
      const tooLarge = file.size > maxPhotoBytes;
      return { id: nextId.current++, file, photoCategory, visibility, status: tooLarge ? "failed" : "waiting", error: tooLarge ? "Larger than 40 MB." : undefined };
    });
    // A finished batch is cleared when the next one starts; unfinished and failed photos stay.
    setUploads((current) => [...current.filter((upload) => upload.status !== "done"), ...added]);
    waiting.current.push(...added.filter((upload) => upload.status === "waiting"));
    pump();
  }

  function retry(upload: Upload) {
    waiting.current.push(upload);
    update(upload.id, { status: "waiting", error: undefined });
    pump();
  }

  const done = uploads.filter((upload) => upload.status === "done").length;
  const failed = uploads.filter((upload) => upload.status === "failed");
  const inProgress = uploads.length - done - failed.length;
  const retryable = failed.filter((upload) => upload.file.size <= maxPhotoBytes);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <Field htmlFor="photo-category" label="Category">
          <select className={fieldStyles} id="photo-category" onChange={(event) => setPhotoCategory(event.target.value as PhotoCategory)} value={photoCategory}>{categories.map((category) => <option key={category} value={category}>{photoCategoryLabels[category]}</option>)}</select>
        </Field>
        <Field htmlFor="photo-visibility" label="Who can see them">
          <select className={fieldStyles} id="photo-visibility" onChange={(event) => setVisibility(event.target.value as RecordVisibility)} value={visibility}><option value="CUSTOMER_VISIBLE">Customer and staff</option><option value="INTERNAL_ONLY">Staff only</option></select>
        </Field>
        <div className="flex gap-2">
          <label className={buttonStyles({ className: "cursor-pointer" })}>
            <Camera size={16} /> Take photo
            <input accept="image/*" capture="environment" className="sr-only" onChange={(event) => { add(event.target.files); event.target.value = ""; }} type="file" />
          </label>
          <label className={buttonStyles({ variant: "outline", className: "cursor-pointer" })}>
            <ImagePlus size={16} /> Choose photos
            <input accept="image/*,.heic,.heif" className="sr-only" multiple onChange={(event) => { add(event.target.files); event.target.value = ""; }} type="file" />
          </label>
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="flex items-center gap-2 text-sm font-bold">
              {inProgress > 0
                ? <>Uploading: {done} of {uploads.length} done</>
                : failed.length
                  ? <><CircleAlert className="text-danger" size={16} /> {done} uploaded, {failed.length} couldn&apos;t be uploaded</>
                  : <><CircleCheck className="text-success" size={16} /> {done} photo{done === 1 ? "" : "s"} uploaded</>}
            </p>
            <div className="flex gap-2">
              {inProgress === 0 && retryable.length > 1 && <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => retryable.forEach(retry)} type="button"><RotateCw size={14} /> Retry all</button>}
              {inProgress === 0 && <button className={buttonStyles({ variant: "ghost", size: "sm" })} onClick={() => { setUploads([]); setNotice(""); }} type="button"><X size={14} /> Dismiss</button>}
            </div>
          </div>
          <div aria-hidden className="mt-3 h-1.5 bg-line"><div className={`h-full transition-[width] ${failed.length && !inProgress ? "bg-danger" : "bg-brand"}`} style={{ width: `${Math.round(((done + failed.length) / uploads.length) * 100)}%` }} /></div>
          {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
          {failed.length > 0 && (
            <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
              {failed.map((upload) => (
                <li className="flex flex-wrap items-center justify-between gap-3 py-2" key={upload.id}>
                  <span className="min-w-0"><span className="block truncate font-bold">{upload.file.name}</span><span className="block text-danger">{upload.error}</span></span>
                  {upload.file.size <= maxPhotoBytes && <button className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => retry(upload)} type="button"><RotateCw size={14} /> Retry</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
