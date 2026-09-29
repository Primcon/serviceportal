import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageCount, pageHref, type SearchParams } from "@/lib/pagination";

/** "Showing 26–50 of 212" with previous and next links. Renders nothing when everything fits on one page. */
export function Pagination({ pathname, params, page, pageSize, total, label = "results" }: {
  pathname: string;
  params: SearchParams;
  page: number;
  pageSize: number;
  total: number;
  label?: string;
}) {
  const pages = pageCount(total, pageSize);
  if (pages <= 1) return null;
  const current = Math.min(page, pages);
  const first = (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);
  const linkStyles = "flex items-center gap-1 font-bold text-brand hover:text-brand-strong";
  const disabledStyles = "flex items-center gap-1 text-subtle";

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 text-sm">
      {current > 1 ? <Link className={linkStyles} href={pageHref(pathname, params, current - 1)}><ChevronLeft size={16} /> Previous</Link> : <span aria-hidden="true" className={disabledStyles}><ChevronLeft size={16} /> Previous</span>}
      <span className="text-muted tabular-nums">Showing {first}–{last} of {total} {label}</span>
      {current < pages ? <Link className={linkStyles} href={pageHref(pathname, params, current + 1)}>Next <ChevronRight size={16} /></Link> : <span aria-hidden="true" className={disabledStyles}>Next <ChevronRight size={16} /></span>}
    </nav>
  );
}
