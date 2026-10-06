import type { WorkOrderCondition } from "@prisma/client";

type Stage = { sequence: number; displayName: string; customerLabel: string | null; isActive?: boolean };

/** What a customer sees a stage called: its customer label, or the stage's own name if none is set. */
export function customerStageLabel(stage: { displayName: string; customerLabel: string | null }) {
  return stage.customerLabel?.trim() || stage.displayName;
}

export type ProgressStep = { label: string; state: "done" | "current" | "upcoming" };

/**
 * The customer's progress tracker: the workflow's stages collapsed into the handful of steps
 * customers are shown, each marked done, current or still to come. Several internal stages
 * can share one customer step, so moving between them doesn't move the tracker.
 */
export function progressSteps(stages: Stage[], currentSequence: number): ProgressStep[] {
  const ordered = [...stages].filter((stage) => stage.isActive !== false || stage.sequence === currentSequence).sort((a, b) => a.sequence - b.sequence);
  const labels: string[] = [];
  for (const stage of ordered) {
    const label = customerStageLabel(stage);
    if (!labels.includes(label)) labels.push(label);
  }
  const current = ordered.find((stage) => stage.sequence === currentSequence);
  const currentIndex = current ? labels.indexOf(customerStageLabel(current)) : -1;
  return labels.map((label, index) => ({ label, state: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming" }));
}

/** What a holding condition means for the customer, in their terms. Normal progress needs no notice. */
export const customerConditionNotices: Record<WorkOrderCondition, { title: string; detail: string } | null> = {
  NORMAL: null,
  WAITING_ON_PARTS: { title: "Waiting on parts", detail: "Work will continue as soon as the parts for this repair arrive." },
  AWAITING_CUSTOMER: { title: "We need something from you", detail: "This repair is waiting on your reply or approval. Check the latest update, or contact your service team." },
  CUSTOMER_HOLD: { title: "On hold at your request", detail: "Let your service team know when you'd like work to continue." },
  WARRANTY_REVIEW: { title: "Under warranty review", detail: "We're checking whether this repair is covered by warranty." },
  QUOTE_DECLINED: { title: "Quote declined", detail: "The quote for this repair was declined. Your service team will be in touch about returning the equipment." },
  CANCELLED: { title: "Cancelled", detail: "This repair was cancelled." },
};
