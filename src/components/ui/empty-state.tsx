import type { ReactNode } from "react";

/** Shown in place of a list with nothing in it: what's missing and what to do next. */
export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-line bg-paper px-5 py-14 text-center">
      {icon && <div className="mx-auto grid place-items-center text-muted">{icon}</div>}
      <p className="mt-4 font-bold">{title}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
