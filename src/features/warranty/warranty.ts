import { shopTimeZone } from "@/lib/dates";

/**
 * Repair warranty rules. A warranty runs for a number of months from the day the pump ships
 * back to the customer. Its length comes from the customer's service contract when they have
 * one, otherwise from the pump model's standard warranty, and is fixed on the repair when it
 * ships. Dates here are calendar dates, stored at midnight UTC.
 */

export const maxWarrantyMonths = 120;

/** A calendar date a number of months later. The 31st plus one month lands on the month's last day. */
export function addMonths(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/** The last day a repair is covered, or null when there's no ship date or no warranty. */
export function warrantyEndDate(shippedAt: Date | null, months: number | null) {
  return shippedAt && months ? addMonths(shippedAt, months) : null;
}

/** The warranty length a repair gets unless someone sets another: the contract's, else the model's. */
export function standardWarrantyMonths(terms: { contractMonths: number | null; modelMonths: number | null }) {
  return terms.contractMonths ?? terms.modelMonths ?? null;
}

/** Today's calendar date at the shop, as midnight UTC, to compare with stored calendar dates. */
export function shopToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: shopTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${parts}T00:00:00.000Z`);
}

export type WarrantyState = "none" | "active" | "expired";

/** Whether a warranty that ends on a date still covers a given day. The end date itself is covered. */
export function warrantyState(endsAt: Date | null, on = shopToday()): WarrantyState {
  if (!endsAt) return "none";
  return on.getTime() <= endsAt.getTime() ? "active" : "expired";
}

/** "12 months", "1 month", or "2 years" when it's a whole number of years. */
export function warrantyLengthLabel(months: number) {
  if (months >= 24 && months % 12 === 0) return `${months / 12} years`;
  return `${months} month${months === 1 ? "" : "s"}`;
}
