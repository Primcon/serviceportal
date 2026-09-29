import "dotenv/config";
import { describe, expect, it } from "vitest";
import { ReportType } from "@prisma/client";
import { generateReportWorkbook, parseStoredReportFilters } from "./reports";

describe("parseStoredReportFilters", () => {
  it("turns saved calendar days into whole days in the schedule's time zone", () => {
    const filters = parseStoredReportFilters({ from: "2026-09-01", to: "2026-09-30", statuses: ["OPEN"] }, "America/Phoenix");
    expect(filters.from?.toISOString()).toBe("2026-09-01T07:00:00.000Z");
    expect(filters.to?.toISOString()).toBe("2026-10-01T06:59:59.999Z");
    expect(filters.statuses).toEqual(["OPEN"]);
  });

  it("ignores missing or malformed saved filters instead of failing the delivery", () => {
    expect(parseStoredReportFilters(null, "UTC")).toEqual({});
    expect(parseStoredReportFilters({ from: "not-a-date" }, "UTC")).toEqual({});
    expect(parseStoredReportFilters({ companyId: "c1" }, "UTC")).toEqual({ companyId: "c1" });
  });

  it("produces filters the database accepts", async () => {
    const filters = parseStoredReportFilters({ from: "2026-01-01", to: "2026-01-31" }, "America/New_York");
    await expect(generateReportWorkbook(ReportType.WORK_ORDERS, filters)).resolves.toMatchObject({ fileName: expect.stringMatching(/\.xlsx$/) });
  });
});
