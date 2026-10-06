import { describe, expect, it } from "vitest";
import { ageDistribution, median, throughputWindowStart, weeklyThroughput } from "./metrics";

const zone = "America/Phoenix";
// Wednesday 7 October 2026, mid-morning in Phoenix.
const now = new Date("2026-10-07T17:00:00Z");

describe("weeklyThroughput", () => {
  it("counts jobs into Monday-to-Sunday weeks in the shop's time zone", () => {
    const weeks = weeklyThroughput({
      weeks: 3,
      now,
      timeZone: zone,
      opened: [
        new Date("2026-10-05T07:00:00Z"), // Monday 12:00 am in Phoenix: this week
        new Date("2026-10-05T06:59:00Z"), // Sunday 11:59 pm in Phoenix: last week
        new Date("2026-09-22T18:00:00Z"), // two weeks ago
        new Date("2026-09-01T18:00:00Z"), // before the window: ignored
      ],
      completed: [new Date("2026-10-06T20:00:00Z"), new Date("2026-10-07T01:00:00Z")],
    });
    expect(weeks.map((week) => [week.label, week.opened, week.completed])).toEqual([["Sep 21", 1, 0], ["Sep 28", 1, 0], ["Oct 5", 1, 2]]);
  });

  it("starts its window on the Monday of the oldest week", () => {
    expect(throughputWindowStart(3, now, zone).toISOString()).toBe("2026-09-21T07:00:00.000Z");
  });
});

describe("ageDistribution", () => {
  it("groups open jobs by days since they were received", () => {
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
    expect(ageDistribution([daysAgo(0), daysAgo(7), daysAgo(8), daysAgo(29), daysAgo(31), daysAgo(200)], now).map((bucket) => bucket.count)).toEqual([2, 1, 1, 2]);
  });
});

describe("median", () => {
  it("returns the middle value, or nothing for an empty list", () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 100])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
