"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PhotoCategory } from "@prisma/client";
import { Modal } from "@/components/ui/modal";
import { photoCategoryLabels } from "@/lib/labels";

export type CustomerPhoto = { id: string; fileName: string; caption: string | null; photoCategory: PhotoCategory | null; takenOn: string };

const categoryOrder = Object.keys(photoCategoryLabels) as PhotoCategory[];

/** The photos shared on a repair, grouped by the point in the repair they were taken, with a full-size viewer. */
export function CustomerPhotoGallery({ photos }: { photos: CustomerPhoto[] }) {
  // Viewer order follows the repair: arrival first, shipping last.
  const ordered = [...photos].sort((a, b) => categoryOrder.indexOf(a.photoCategory ?? "INSPECTION") - categoryOrder.indexOf(b.photoCategory ?? "INSPECTION"));
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex === null ? null : ordered[openIndex];

  useEffect(() => {
    if (openIndex === null) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") setOpenIndex((index) => (index !== null && index > 0 ? index - 1 : index));
      if (event.key === "ArrowRight") setOpenIndex((index) => (index !== null && index < ordered.length - 1 ? index + 1 : index));
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openIndex, ordered.length]);

  const groups = categoryOrder.map((category) => ({ category, photos: ordered.filter((photo) => (photo.photoCategory ?? "INSPECTION") === category) })).filter((group) => group.photos.length);

  return (
    <div className="grid gap-6">
      {groups.map((group) => (
        <section aria-label={photoCategoryLabels[group.category]} key={group.category}>
          <h3 className="border-b border-line pb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted">{photoCategoryLabels[group.category]} <span className="font-normal">({group.photos.length})</span></h3>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {group.photos.map((photo) => (
              <li key={photo.id}>
                <button className="group block w-full text-left" onClick={() => setOpenIndex(ordered.indexOf(photo))} type="button">
                  <span className="block aspect-square overflow-hidden border border-line bg-surface group-hover:border-brand">
                    <Image alt={photo.caption || `${photoCategoryLabels[group.category]} photo`} className="size-full object-cover" height={480} src={`/api/attachments/${photo.id}?variant=thumbnail`} unoptimized width={480} />
                  </span>
                  {photo.caption && <span className="mt-1.5 block truncate text-xs text-muted">{photo.caption}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {open && openIndex !== null && (
        <Modal description={`${openIndex + 1} of ${ordered.length} · ${photoCategoryLabels[open.photoCategory ?? "INSPECTION"]} · ${open.takenOn}`} onClose={() => setOpenIndex(null)} size="lg" title={open.caption || "Service photo"}>
          <div className="relative bg-ink">
            <Image alt={open.caption || "Service photo"} className="mx-auto max-h-[70vh] w-auto object-contain" height={1800} key={open.id} src={`/api/attachments/${open.id}`} unoptimized width={2400} />
            {openIndex > 0 && <button aria-label="Previous photo" className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center bg-paper/90 text-ink hover:text-brand" onClick={() => setOpenIndex(openIndex - 1)} type="button"><ChevronLeft size={22} /></button>}
            {openIndex < ordered.length - 1 && <button aria-label="Next photo" className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center bg-paper/90 text-ink hover:text-brand" onClick={() => setOpenIndex(openIndex + 1)} type="button"><ChevronRight size={22} /></button>}
          </div>
        </Modal>
      )}
    </div>
  );
}
