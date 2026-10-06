import { describe, expect, it } from "vitest";
import { isOverdue, wholeDaysSince } from "./queue";

describe("queue timing", () => {
  const now = new Date("2026-10-07T15:30:00Z");

  it("counts whole days in a stage", () => {
    expect(wholeDaysSince(new Date("2026-10-07T09:00:00Z"), now)).toBe(0);
    expect(wholeDaysSince(new Date("2026-10-06T15:29:00Z"), now)).toBe(1);
    expect(wholeDaysSince(new Date("2026-09-30T15:30:00Z"), now)).toBe(7);
    expect(wholeDaysSince(new Date("2026-10-08T00:00:00Z"), now)).toBe(0);
  });

  it("treats a job as overdue from the day after its promised date", () => {
    expect(isOverdue(new Date("2026-10-07T00:00:00Z"), now)).toBe(false);
    expect(isOverdue(new Date("2026-10-06T00:00:00Z"), now)).toBe(true);
    expect(isOverdue(new Date("2026-10-08T00:00:00Z"), now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });
});
