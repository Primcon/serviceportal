"use client";

import Link from "next/link";
import { useId, useState, type DragEvent } from "react";
import { ArrowRightLeft, CalendarClock, MoveRight, UserRound } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { updateWorkOrderStatus } from "@/features/work-orders/actions";

/** One card on the board. Everything is worked out on the server, including the date text. */
export type BoardJob = {
  id: string;
  number: string;
  summary: string;
  company: string;
  model: string;
  stageId: string;
  condition: string;
  conditionLabel: string | null;
  priority: string | null;
  overdue: boolean;
  assigneeId: string | null;
  assignee: string;
  days: number;
  promised: string | null;
};

export type BoardColumn = { id: string; name: string; canDrop: boolean; jobs: BoardJob[] };

type Move = { job: BoardJob; stageId: string };

/**
 * The stage board. Drag a card to another column, or use its Move button, to move the job.
 * Either way a short form asks who has it next and for a note, and the same checks apply as
 * on the work order page: required checklist steps, the signed traveler, and manager overrides.
 */
export function StageBoard({ columns, stages, staff, viewerId, isManager }: { columns: BoardColumn[]; stages: { id: string; name: string }[]; staff: { id: string; name: string }[]; viewerId: string; isManager: boolean }) {
  const formId = useId();
  const [move, setMove] = useState<Move | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moved, setMoved] = useState("");

  function startDrag(event: DragEvent, job: BoardJob) {
    event.dataTransfer.setData("text/plain", job.id);
    event.dataTransfer.effectAllowed = "move";
  }

  function drop(event: DragEvent, column: BoardColumn) {
    event.preventDefault();
    setDropTarget(null);
    const job = columns.flatMap((each) => each.jobs).find((each) => each.id === event.dataTransfer.getData("text/plain"));
    if (job && column.canDrop && job.stageId !== column.id) setMove({ job, stageId: column.id });
  }

  function nextStage(job: BoardJob) {
    const index = stages.findIndex((stage) => stage.id === job.stageId);
    return stages[index + 1]?.id ?? stages[index]?.id ?? stages[0]?.id ?? "";
  }

  const close = () => setMove(null);
  const stageName = (id: string) => stages.find((stage) => stage.id === id)?.name ?? "";

  return (
    <>
      {moved && <p className="mt-4 border-l-4 border-success bg-success-soft px-4 py-2.5 text-sm" role="status">{moved}</p>}
      <div className="mt-6 overflow-x-auto pb-4">
        <div className="flex min-w-max items-start gap-3">
          {columns.map((column) => (
            <section
              aria-label={column.name}
              className={`w-64 shrink-0 border bg-surface ${dropTarget === column.id ? "border-brand" : "border-line"}`}
              key={column.id}
              onDragLeave={() => setDropTarget((current) => (current === column.id ? null : current))}
              onDragOver={(event) => { if (!column.canDrop) return; event.preventDefault(); setDropTarget(column.id); }}
              onDrop={(event) => drop(event, column)}
            >
              <h2 className="flex items-center justify-between gap-2 border-b border-line bg-paper px-3 py-2.5 text-sm font-bold">{column.name}<span className="font-normal tabular-nums text-muted">{column.jobs.length}</span></h2>
              <ul className="grid min-h-16 gap-2 p-2">
                {column.jobs.map((job) => (
                  <li className="group relative cursor-grab border border-line bg-paper p-3 hover:border-brand active:cursor-grabbing" draggable key={job.id} onDragStart={(event) => startDrag(event, job)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-brand">{job.number}</span>
                        {job.overdue && <Badge tone="danger">Overdue</Badge>}
                        {job.priority && <Badge tone="brand">{job.priority}</Badge>}
                        {job.conditionLabel && <Badge tone="outline">{job.conditionLabel}</Badge>}
                      </p>
                      <button aria-label={`Move ${job.number} to another stage`} className="grid size-7 shrink-0 place-items-center border border-line text-muted hover:border-brand hover:text-brand" onClick={() => setMove({ job, stageId: nextStage(job) })} title="Move to another stage" type="button"><MoveRight size={14} /></button>
                    </div>
                    <Link className="mt-1 line-clamp-2 block text-sm font-bold hover:text-brand" draggable={false} href={`/workspace/work-orders/${job.id}`}>{job.summary}</Link>
                    <p className="mt-1 truncate text-xs text-muted">{job.company}</p>
                    <p className="truncate text-xs text-muted">{job.model}</p>
                    <p className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs text-muted">
                      <span className="flex items-center gap-1"><UserRound size={12} />{job.assignee}</span>
                      <span className={job.days >= 7 ? "font-bold text-ink" : ""}>{job.days === 0 ? "Today" : `${job.days}d`}</span>
                      {job.promised && <span className={`flex items-center gap-1 ${job.overdue ? "font-bold text-danger" : ""}`}><CalendarClock size={12} />{job.promised}</span>}
                    </p>
                  </li>
                ))}
                {!column.jobs.length && <li className="px-2 py-4 text-center text-xs text-subtle">{column.canDrop ? "Drop a job here" : "Empty"}</li>}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {move && (
        <Modal description={`${move.job.summary} · ${move.job.company}`} eyebrow={`WIP ${move.job.number}`} onClose={close} size="sm" title={`Move to ${stageName(move.stageId)}`}>
          <ActionFeedbackForm
            action={async (formData) => {
              const result = await updateWorkOrderStatus(formData);
              if (result.status === "success") {
                setMoved(`${move.job.number} moved to ${stageName(String(formData.get("serviceStageId")))}.`);
                close();
              }
              return result;
            }}
            className="grid gap-4"
          >
            <input name="workOrderId" type="hidden" value={move.job.id} />
            <input name="condition" type="hidden" value={move.job.condition} />
            <Field htmlFor={`${formId}-stage`} label="Stage">
              <select className={fieldStyles} defaultValue={move.stageId} id={`${formId}-stage`} name="serviceStageId" onChange={(event) => setMove({ ...move, stageId: event.target.value })}>
                {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </Field>
            <Field htmlFor={`${formId}-handoff`} label="Hand to">
              <select className={fieldStyles} defaultValue="keep" id={`${formId}-handoff`} name="handoff">
                <option value="keep">{move.job.assigneeId ? `Keep with ${move.job.assigneeId === viewerId ? "me" : move.job.assignee}` : "Leave in the queue"}</option>
                {move.job.assigneeId && <option value="">The queue (nobody in particular)</option>}
                {staff.filter((person) => person.id !== move.job.assigneeId).map((person) => <option key={person.id} value={person.id}>{person.id === viewerId ? "Me" : person.name}</option>)}
              </select>
            </Field>
            <Field hint="Staff only. Say what was done and what's next." htmlFor={`${formId}-note`} label="Handoff note" optional>
              <textarea className={fieldStyles} id={`${formId}-note`} maxLength={1000} name="note" rows={2} />
            </Field>
            {isManager && (
              <Field hint="Only needed with required checklist steps unsigned, or to complete without a signed traveler. It's recorded." htmlFor={`${formId}-override`} label="Manager override reason" optional>
                <input className={fieldStyles} id={`${formId}-override`} maxLength={500} name="overrideReason" />
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <button className={buttonStyles({ variant: "outline" })} onClick={close} type="button">Cancel</button>
              <button className={buttonStyles()}><ArrowRightLeft size={16} /> Move</button>
            </div>
          </ActionFeedbackForm>
        </Modal>
      )}
    </>
  );
}
