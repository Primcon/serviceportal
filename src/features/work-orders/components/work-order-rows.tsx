"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Badge } from "@/components/ui/badge";
import { fieldStyles, buttonStyles } from "@/components/ui/styles";
import { bulkUpdateWorkOrders } from "@/features/work-orders/list-actions";

/** One row of the work order list. Text, including dates, is prepared on the server. */
export type WorkOrderRow = {
  id: string;
  number: string;
  summary: string;
  detail: string;
  priority: string | null;
  condition: string | null;
  stage: string;
  status: string;
  with: string | null;
};

/**
 * The work order list's rows. Tick jobs to hand them to someone or move them to a stage
 * together; each one is still checked and recorded as if it were done on its own page.
 */
export function WorkOrderRows({ rows, stages, staff, viewerId, isManager }: { rows: WorkOrderRow[]; stages: { id: string; name: string }[]; staff: { id: string; name: string }[]; viewerId: string; isManager: boolean }) {
  const formId = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [operation, setOperation] = useState<"handoff" | "stage">("handoff");
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line bg-surface px-5 py-2 text-sm">
        <label className="flex items-center gap-2 font-bold text-muted">
          <input checked={allSelected} className="size-4 accent-brand" onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))} type="checkbox" />
          Select all on this page
        </label>
        {selected.size > 0 && <span className="text-muted">{selected.size} selected</span>}
      </div>
      {rows.map((row) => (
        <div className={`group grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 border-b border-line px-5 py-5 last:border-b-0 hover:bg-surface ${selected.has(row.id) ? "bg-brand-soft/40" : ""}`} key={row.id}>
          <input aria-label={`Select ${row.number}`} checked={selected.has(row.id)} className="mt-1 size-4 accent-brand" onChange={() => toggle(row.id)} type="checkbox" />
          <Link className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]" href={`/workspace/work-orders/${row.id}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-brand">{row.number}</p>
                {row.priority && <Badge tone="danger">{row.priority}</Badge>}
                {row.condition && <Badge tone="outline">{row.condition}</Badge>}
              </div>
              <h2 className="mt-1 text-lg font-bold group-hover:text-brand">{row.summary}</h2>
              <p className="mt-2 text-sm text-muted">{row.detail}</p>
            </div>
            <div className="flex items-start gap-3 sm:text-right">
              <div>
                <p className="font-bold">{row.stage}</p>
                <p className="mt-1 text-sm text-muted">{row.status}</p>
                {row.with && <p className="mt-1 text-sm text-muted">{row.with}</p>}
              </div>
              <ArrowUpRight className="mt-1 text-brand" size={18} />
            </div>
          </Link>
        </div>
      ))}

      {selected.size > 0 && (
        <div className="sticky bottom-0 z-20 border-t-2 border-ink bg-paper px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
          <ActionFeedbackForm
            action={async (formData) => {
              const result = await bulkUpdateWorkOrders(formData);
              if (result.status === "success") setSelected(new Set());
              return result;
            }}
            className="grid gap-3 lg:grid-cols-[auto_200px_minmax(0,220px)_minmax(0,1fr)_auto] lg:items-end"
            feedbackClassName="lg:col-span-5"
          >
            {[...selected].map((id) => <input key={id} name="ids" type="hidden" value={id} />)}
            <p className="self-center text-sm font-bold">{selected.size} job{selected.size === 1 ? "" : "s"}</p>
            <label className="grid gap-1 text-xs font-bold text-muted" htmlFor={`${formId}-operation`}>Do
              <select className={fieldStyles} id={`${formId}-operation`} name="operation" onChange={(event) => setOperation(event.target.value as "handoff" | "stage")} value={operation}>
                <option value="handoff">Hand to someone</option>
                <option value="stage">Move to a stage</option>
              </select>
            </label>
            {operation === "handoff" ? (
              <label className="grid gap-1 text-xs font-bold text-muted" htmlFor={`${formId}-assignee`}>To
                <select className={fieldStyles} id={`${formId}-assignee`} name="assigneeId" required>
                  <option value="">The queue (nobody in particular)</option>
                  <option value="me">Me</option>
                  {staff.filter((person) => person.id !== viewerId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
            ) : (
              <label className="grid gap-1 text-xs font-bold text-muted" htmlFor={`${formId}-stage`}>Stage
                <select className={fieldStyles} defaultValue="" id={`${formId}-stage`} name="serviceStageId" required>
                  <option disabled value="">Choose stage</option>
                  {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                </select>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-bold text-muted" htmlFor={`${formId}-note`}>Note (optional, staff only)
                <input className={fieldStyles} id={`${formId}-note`} maxLength={1000} name="note" />
              </label>
              {isManager && operation === "stage" && (
                <label className="grid gap-1 text-xs font-bold text-muted" htmlFor={`${formId}-override`}>Manager override reason (optional)
                  <input className={fieldStyles} id={`${formId}-override`} maxLength={500} name="overrideReason" />
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <button className={buttonStyles()}>Apply</button>
              <button className={buttonStyles({ variant: "outline" })} onClick={() => setSelected(new Set())} type="button"><X size={16} /><span className="sr-only">Clear selection</span></button>
            </div>
          </ActionFeedbackForm>
        </div>
      )}
    </>
  );
}
