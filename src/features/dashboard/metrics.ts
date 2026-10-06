import { DateTime } from "luxon";

export type WeekCount = { weekStart: string; label: string; opened: number; completed: number };

/**
 * Jobs opened and completed in each of the last few weeks, oldest first. Weeks run Monday
 * to Sunday in the shop's time zone, and the last one is the week in progress.
 */
export function weeklyThroughput(input: { opened: Date[]; completed: Date[]; weeks: number; now: Date; timeZone: string }): WeekCount[] {
  const thisWeek = DateTime.fromJSDate(input.now, { zone: input.timeZone }).startOf("week");
  const weeks = Array.from({ length: input.weeks }, (_, index) => thisWeek.minus({ weeks: input.weeks - 1 - index }));
  const counts = weeks.map((week) => ({ weekStart: week.toISODate()!, label: week.toFormat("LLL d"), opened: 0, completed: 0 }));
  const indexOf = (date: Date) => Math.round(DateTime.fromJSDate(date, { zone: input.timeZone }).startOf("week").diff(weeks[0], "weeks").weeks);
  for (const date of input.opened) {
    const index = indexOf(date);
    if (index >= 0 && index < counts.length) counts[index].opened += 1;
  }
  for (const date of input.completed) {
    const index = indexOf(date);
    if (index >= 0 && index < counts.length) counts[index].completed += 1;
  }
  return counts;
}

/** The first moment of the oldest week weeklyThroughput will report, for limiting the query. */
export function throughputWindowStart(weeks: number, now: Date, timeZone: string) {
  return DateTime.fromJSDate(now, { zone: timeZone }).startOf("week").minus({ weeks: weeks - 1 }).toJSDate();
}

export const ageBuckets = [
  { label: "Up to 1 week", maxDays: 7 },
  { label: "1 to 2 weeks", maxDays: 14 },
  { label: "2 to 4 weeks", maxDays: 30 },
  { label: "Over 30 days", maxDays: Infinity },
] as const;

/** How many open jobs fall in each age bucket, by days since the pump was received. */
export function ageDistribution(receivedDates: Date[], now: Date) {
  const counts = ageBuckets.map((bucket) => ({ label: bucket.label, count: 0 }));
  for (const received of receivedDates) {
    const days = Math.max(0, (now.getTime() - received.getTime()) / 86_400_000);
    counts[ageBuckets.findIndex((bucket) => days <= bucket.maxDays)].count += 1;
  }
  return counts;
}

/** The middle value, which a few very slow jobs don't distort the way an average would. */
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
