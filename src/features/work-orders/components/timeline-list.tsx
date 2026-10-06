import Image from "next/image";
import Link from "next/link";
import { ArrowRightLeft, Camera, EyeOff, FileText, Flag, Lightbulb, MessageSquareText, Send } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { customerStatusLabels, documentTypeLabels, formatEnumLabel, photoCategoryLabels } from "@/lib/labels";
import type { TimelineEntry } from "@/features/work-orders/timeline";

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function Entry({ icon, tone, title, meta, internal, children }: { icon: ReactNode; tone: "brand" | "ink" | "muted"; title: ReactNode; meta: string; internal?: boolean; children?: ReactNode }) {
  const dot = tone === "brand" ? "bg-brand text-white" : tone === "ink" ? "bg-ink text-white" : "bg-surface text-muted border border-line";
  return (
    <li className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-6 last:pb-0">
      <span className={`z-10 grid size-8 place-items-center rounded-full ${dot}`}>{icon}</span>
      <div className="min-w-0 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold">{title}</p>
          {internal && <Badge tone="neutral"><EyeOff className="mr-1" size={12} />Internal</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-muted">{meta}</p>
        {children && <div className="mt-2 text-sm leading-6 text-body">{children}</div>}
      </div>
    </li>
  );
}

function Body({ text }: { text: string }) {
  return <p className="whitespace-pre-line">{text}</p>;
}

/** The work order's history, newest first. Internal entries are marked so staff don't mistake them for customer-visible ones. */
export function TimelineList({ entries, workOrderId }: { entries: TimelineEntry[]; workOrderId: string }) {
  if (!entries.length) return <p className="px-1 py-6 text-sm text-muted">Nothing recorded yet.</p>;
  return (
    <ol className="relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-line">
      {entries.map((entry) => {
        const meta = `${entry.actor} · ${dateTime.format(entry.at)}`;
        switch (entry.kind) {
          case "status":
            return (
              <Entry icon={<Flag size={15} />} key={`status-${entry.id}`} meta={meta} title={entry.isFirst ? `Work order opened at ${entry.stage}` : `Moved to ${entry.stage}`} tone="ink">
                <p className="text-muted">Customer sees: {customerStatusLabels[entry.customerStatus]}{entry.condition !== "NORMAL" && ` · Condition: ${formatEnumLabel(entry.condition)}`}</p>
                {entry.note && <div className="mt-1 border-l-2 border-line pl-3"><Body text={entry.note} /></div>}
              </Entry>
            );
          case "customer-update":
            return (
              <Entry icon={<Send size={14} />} key={`update-${entry.id}`} meta={`${meta}${entry.emailed ? " · Emailed to customer" : ""}`} title={entry.title} tone="brand">
                <Body text={entry.body} />
              </Entry>
            );
          case "internal-note":
            return (
              <Entry icon={<MessageSquareText size={14} />} internal key={`note-${entry.id}`} meta={meta} title="Note" tone="muted">
                <Body text={entry.body} />
              </Entry>
            );
          case "handoff":
            return (
              <Entry icon={<ArrowRightLeft size={14} />} internal key={`handoff-${entry.id}`} meta={meta} title={entry.to === null ? "Returned to the queue" : entry.to === entry.actor ? `${entry.actor} took this job` : `Handed to ${entry.to}`} tone="muted">
                {entry.note && <Body text={entry.note} />}
              </Entry>
            );
          case "finding":
            return (
              <Entry icon={<Lightbulb size={15} />} internal={!entry.shared} key={`finding-${entry.id}`} meta={meta} title={`Finding: ${entry.title}`} tone={entry.shared ? "brand" : "muted"}>
                <Body text={entry.body} />
              </Entry>
            );
          case "photos":
            return (
              <Entry
                icon={<Camera size={14} />}
                internal={entry.sharedCount === 0}
                key={`photos-${entry.id}`}
                meta={`${meta}${entry.sharedCount > 0 && entry.sharedCount < entry.photoIds.length ? ` · ${entry.sharedCount} shared with customer` : ""}`}
                title={`${entry.photoIds.length} ${entry.category ? photoCategoryLabels[entry.category].toLowerCase() : ""} photo${entry.photoIds.length === 1 ? "" : "s"} added`}
                tone={entry.sharedCount > 0 ? "brand" : "muted"}
              >
                <div className="flex flex-wrap gap-2">
                  {entry.photoIds.slice(0, 6).map((photoId) => (
                    <Link className="block size-16 overflow-hidden border border-line bg-surface hover:border-brand" href={`/workspace/work-orders/${workOrderId}?photo=${photoId}#photos`} key={photoId} scroll={false}>
                      <Image alt="" className="size-16 object-cover" height={64} src={`/api/internal/attachments/${photoId}?variant=thumbnail`} unoptimized width={64} />
                    </Link>
                  ))}
                  {entry.photoIds.length > 6 && <span className="grid size-16 place-items-center border border-line bg-surface text-xs font-bold text-muted">+{entry.photoIds.length - 6}</span>}
                </div>
              </Entry>
            );
          case "document":
            return (
              <Entry icon={<FileText size={14} />} internal={!entry.shared} key={`document-${entry.id}`} meta={meta} title={`${entry.documentType ? documentTypeLabels[entry.documentType] : "Document"} added`} tone={entry.shared ? "brand" : "muted"}>
                <a className="font-bold text-brand hover:text-brand-strong" href={`/api/internal/attachments/${entry.id}`}>{entry.fileName}</a>
              </Entry>
            );
        }
      })}
    </ol>
  );
}
