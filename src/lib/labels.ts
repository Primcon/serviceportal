import type { CustomerFacingStatus } from "@prisma/client";

export const customerStatusLabels: Record<CustomerFacingStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  COMPLETED: "Completed",
};

/** Turns an enum value such as WAITING_ON_PARTS into "Waiting On Parts". */
export function formatEnumLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
