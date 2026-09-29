import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { ReportFrequency } from "@prisma/client";
import { nextReportOccurrence } from "./report-dispatch";

describe("nextReportOccurrence", () => {
  it("preserves the selected local time for daily, weekly, and monthly schedules", () => {
    const startAt = DateTime.fromISO("2026-01-31T14:30:00", { zone: "America/New_York" }).toUTC().toJSDate();
    const daily = nextReportOccurrence(startAt, ReportFrequency.DAILY, "America/New_York");
    const weekly = nextReportOccurrence(startAt, ReportFrequency.WEEKLY, "America/New_York");
    const monthly = nextReportOccurrence(startAt, ReportFrequency.MONTHLY, "America/New_York");

    expect(DateTime.fromJSDate(daily, { zone: "utc" }).setZone("America/New_York").toFormat("yyyy-MM-dd HH:mm")).toBe("2026-02-01 14:30");
    expect(DateTime.fromJSDate(weekly, { zone: "utc" }).setZone("America/New_York").toFormat("yyyy-MM-dd HH:mm")).toBe("2026-02-07 14:30");
    expect(DateTime.fromJSDate(monthly, { zone: "utc" }).setZone("America/New_York").toFormat("yyyy-MM-dd HH:mm")).toBe("2026-02-28 14:30");
  });

  it("keeps the selected wall-clock time through daylight-saving changes", () => {
    const startAt = DateTime.fromISO("2026-03-07T09:00:00", { zone: "America/New_York" }).toUTC().toJSDate();
    const next = nextReportOccurrence(startAt, ReportFrequency.DAILY, "America/New_York");

    expect(DateTime.fromJSDate(next, { zone: "utc" }).setZone("America/New_York").toFormat("yyyy-MM-dd HH:mm")).toBe("2026-03-08 09:00");
  });
});