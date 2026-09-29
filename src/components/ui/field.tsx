import type { ReactNode } from "react";

/** A labelled form control. Put an input, select or textarea (styled with fieldStyles) inside. */
export function Field({ label, htmlFor, hint, optional = false, className = "", children }: {
  label: string;
  htmlFor?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`grid gap-1.5 text-sm font-bold ${className}`} htmlFor={htmlFor}>
      <span>
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </span>
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}
