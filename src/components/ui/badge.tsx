import type { ReactNode } from "react";

type BadgeTone = "brand" | "neutral" | "success" | "danger" | "outline";

const tones: Record<BadgeTone, string> = {
  brand: "bg-brand-soft text-danger",
  neutral: "bg-surface text-muted",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  outline: "border border-line text-muted",
};

/** A short status label, such as a repair status or an account state. */
export function Badge({ tone = "brand", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}
