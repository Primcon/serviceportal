import { Check } from "lucide-react";
import type { ProgressStep } from "@/features/customer/progress";

/**
 * Where a repair is, as a row of steps: done, current, and still to come. On a phone it
 * becomes a vertical list. The current step is named in text too, so it doesn't rely on color.
 */
export function ProgressTracker({ steps, dates = {} }: { steps: ProgressStep[]; dates?: Record<string, string> }) {
  const current = steps.find((step) => step.state === "current");
  return (
    <div>
      <p className="sr-only">Step {steps.findIndex((step) => step.state === "current") + 1} of {steps.length}: {current?.label}</p>
      <ol aria-hidden className="grid gap-0 sm:auto-cols-fr sm:grid-flow-col">
        {steps.map((step, index) => (
          <li className="relative flex gap-3 pb-5 last:pb-0 sm:block sm:pb-0 sm:text-center" key={step.label}>
            {/* The connecting line: down the side on a phone, across on wider screens. */}
            {index < steps.length - 1 && <span className={`absolute left-[13px] top-7 h-full w-0.5 sm:left-1/2 sm:top-[13px] sm:h-0.5 sm:w-full ${step.state === "done" ? "bg-ink" : "bg-line"}`} />}
            <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold sm:mx-auto ${step.state === "done" ? "border-ink bg-ink text-white" : step.state === "current" ? "border-brand bg-brand text-white" : "border-line bg-paper text-subtle"}`}>
              {step.state === "done" ? <Check size={14} strokeWidth={3} /> : index + 1}
            </span>
            <span className="sm:mt-2 sm:block">
              <span className={`block text-sm ${step.state === "current" ? "font-bold text-ink" : step.state === "done" ? "font-bold text-body" : "text-muted"}`}>{step.label}</span>
              {dates[step.label] && <span className="block text-xs text-muted">{dates[step.label]}</span>}
              {step.state === "current" && <span className="mt-0.5 inline-block bg-brand-soft px-1.5 py-0.5 text-[11px] font-bold text-danger">Now</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
