import Link from "next/link";
import type { ReactNode } from "react";
import type { WeekCount } from "@/features/dashboard/metrics";

/** A round number at or above the largest value, so the axis ends on a clean tick. */
export function axisMaximum(largest: number) {
  if (largest <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(largest));
  return [1, 2, 4, 5, 10].map((step) => step * magnitude).find((candidate) => candidate >= largest)!;
}

export type BarRow = { key: string; label: string; value: number; note?: ReactNode; href?: string };

/**
 * Horizontal bars for comparing a handful of counts. One series, so one color and no legend;
 * every bar carries its value, and a row can link to the jobs behind it.
 */
export function BarList({ rows, unit }: { rows: BarRow[]; unit: string }) {
  const largest = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="grid gap-1">
      {rows.map((row) => {
        const content = (
          <>
            <span className="min-w-0 truncate text-sm">{row.label}</span>
            <span aria-hidden className="flex h-4 items-center">
              {row.value > 0 && <span className="h-3.5 min-w-1 rounded-r-[4px] bg-chart-1 group-hover:opacity-80" style={{ width: `${(row.value / largest) * 100}%` }} />}
            </span>
            <span className="text-right text-sm tabular-nums"><span className="font-bold">{row.value}</span><span className="sr-only"> {row.value === 1 ? unit.replace(/s$/, "") : unit}</span>{row.note && <span className="ml-2 text-xs text-muted">{row.note}</span>}</span>
          </>
        );
        const layout = "group grid grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)_minmax(5.5rem,auto)] items-center gap-3 px-2 py-1.5";
        return (
          <li key={row.key}>
            {row.href ? <Link className={`${layout} hover:bg-surface`} href={row.href}>{content}</Link> : <div className={layout}>{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}

const plotHeight = 144;

/**
 * Jobs opened and completed each week, as paired columns. Two series, so a legend; values
 * appear on hover or keyboard focus and in the table underneath.
 */
export function WeeklyColumns({ weeks }: { weeks: WeekCount[] }) {
  const maximum = axisMaximum(Math.max(...weeks.flatMap((week) => [week.opened, week.completed])));
  const ticks = [maximum, maximum / 2, 0];
  const height = (value: number) => Math.max(value > 0 ? 2 : 0, (value / maximum) * plotHeight);

  return (
    <figure>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-body">
        <span className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-[2px] bg-chart-1" /> Opened</span>
        <span className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-[2px] bg-chart-2" /> Completed</span>
      </div>
      <div className="mt-4 grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
        <div aria-hidden className="relative text-right text-xs tabular-nums text-muted" style={{ height: plotHeight }}>
          {ticks.map((tick) => <span className="absolute right-0 -translate-y-1/2" key={tick} style={{ top: plotHeight - (tick / maximum) * plotHeight }}>{tick}</span>)}
        </div>
        <div>
          <div className="relative" style={{ height: plotHeight }}>
            {ticks.map((tick) => <span aria-hidden className={`absolute inset-x-0 border-t ${tick === 0 ? "border-muted" : "border-line"}`} key={tick} style={{ top: plotHeight - (tick / maximum) * plotHeight }} />)}
            <ul className="absolute inset-0 flex items-end justify-around">
              {weeks.map((week, index) => (
                <li className="group relative flex h-full flex-1 items-end justify-center gap-0.5 outline-none hover:bg-surface/70 focus-visible:bg-surface" key={week.weekStart} tabIndex={0}>
                  <span aria-hidden className="w-full max-w-5 rounded-t-[4px] bg-chart-1" style={{ height: height(week.opened) }} />
                  <span aria-hidden className="w-full max-w-5 rounded-t-[4px] bg-chart-2" style={{ height: height(week.completed) }} />
                  <span className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max border border-line bg-paper px-3 py-2 text-left text-xs shadow-md group-hover:block group-focus-visible:block ${index > weeks.length / 2 ? "right-0" : "left-0"}`}>
                    <span className="block text-muted">Week of {week.label}{index === weeks.length - 1 && " (so far)"}</span>
                    <span className="mt-1 flex items-center gap-2"><span aria-hidden className="h-0.5 w-3 bg-chart-1" /><span className="font-bold tabular-nums">{week.opened}</span> opened</span>
                    <span className="flex items-center gap-2"><span aria-hidden className="h-0.5 w-3 bg-chart-2" /><span className="font-bold tabular-nums">{week.completed}</span> completed</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <ul aria-hidden className="mt-1.5 flex justify-around text-center text-xs text-muted">
            {weeks.map((week) => <li className="flex-1 truncate" key={week.weekStart}>{week.label}</li>)}
          </ul>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="w-fit cursor-pointer text-muted hover:text-brand">Show as a table</summary>
        <table className="mt-2 w-full max-w-md border-collapse text-left tabular-nums">
          <thead><tr className="border-b border-line text-xs uppercase tracking-[0.08em] text-muted"><th className="py-1.5 font-bold">Week of</th><th className="py-1.5 text-right font-bold">Opened</th><th className="py-1.5 text-right font-bold">Completed</th></tr></thead>
          <tbody>{weeks.map((week) => <tr className="border-b border-line" key={week.weekStart}><td className="py-1.5">{week.label}</td><td className="py-1.5 text-right">{week.opened}</td><td className="py-1.5 text-right">{week.completed}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
