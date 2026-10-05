import { BookOpen, Download } from "lucide-react";
import type { DocumentType, RecordVisibility } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { documentTypeLabels } from "@/lib/labels";

export type ModelDocumentItem = { id: string; title: string; documentType: DocumentType; visibility: RecordVisibility; fileName: string; sizeBytes: number };

export function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Download links for a model's manuals and other documents. Staff pages pass the internal
 * download path and show which documents customers can see; the customer portal passes its own.
 */
export function ModelDocumentList({ documents, downloadPath, showVisibility = false }: { documents: ModelDocumentItem[]; downloadPath: string; showVisibility?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {documents.map((document) => (
        <li key={document.id}>
          <a className="group flex items-start gap-3 py-3" href={`${downloadPath}/${document.id}`}>
            <BookOpen className="mt-0.5 shrink-0 text-brand" size={17} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold group-hover:text-brand">{document.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                {documentTypeLabels[document.documentType]} · {formatFileSize(document.sizeBytes)}
                {showVisibility && document.visibility === "CUSTOMER_VISIBLE" && <Badge tone="success">Customers can see this</Badge>}
              </span>
            </span>
            <Download className="mt-0.5 shrink-0 text-muted group-hover:text-brand" size={16} />
          </a>
        </li>
      ))}
    </ul>
  );
}
