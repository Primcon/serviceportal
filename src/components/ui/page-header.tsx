import type { ReactNode } from "react";
import { eyebrowStyles } from "./styles";

/** The title block at the top of every page: an eyebrow, the page title, a sentence of context, and optional actions. */
export function PageHeader({ eyebrow, title, description, actions, icon }: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-7">
      <div>
        <p className={`flex items-center gap-2 ${eyebrowStyles}`}>{icon}{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
