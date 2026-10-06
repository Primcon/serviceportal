import type { PhotoCategory } from "@prisma/client";
import { documentTypeLabels, photoCategoryLabels } from "@/lib/labels";

export type ArchiveSource = { id: string; kind: "PHOTO" | "DOCUMENT"; fileName: string; photoCategory: PhotoCategory | null; documentType: keyof typeof documentTypeLabels | null };

/** Characters Windows and macOS won't accept in a file name are replaced, and the name is kept to a sensible length. */
function safeName(name: string) {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (cleaned || "file").slice(0, 120);
}

/**
 * Where each shared file goes inside the download: documents in one folder, photos in a
 * folder per point in the repair. Photos are the viewing copies, so they're named .webp.
 * Files that would share a name get a number.
 */
export function archivePaths(files: ArchiveSource[]) {
  const used = new Set<string>();
  return files.map((file) => {
    const folder = file.kind === "PHOTO"
      ? `Photos/${safeName(photoCategoryLabels[file.photoCategory ?? "INSPECTION"].replace(/\s*\(.*\)$/, ""))}`
      : "Documents";
    const base = safeName(file.fileName);
    const name = file.kind === "PHOTO" ? `${base.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.webp` : base;
    const dot = name.lastIndexOf(".");
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let path = `${folder}/${name}`;
    for (let copy = 2; used.has(path.toLowerCase()); copy += 1) path = `${folder}/${stem} (${copy})${extension}`;
    used.add(path.toLowerCase());
    return { id: file.id, path };
  });
}
