import { describe, expect, it } from "vitest";
import { addMonths, shopToday, standardWarrantyMonths, warrantyEndDate, warrantyLengthLabel, warrantyState } from "./warranty";

const date = (text: string) => new Date(`${text}T00:00:00.000Z`);

describe("warranty dates", () => {
  it("runs a number of months from the ship date", () => {
    expect(warrantyEndDate(date("2026-10-06"), 6)).toEqual(date("2027-04-06"));
    expect(warrantyEndDate(date("2026-10-06"), 24)).toEqual(date("2028-10-06"));
  });

  it("lands on the last day of a shorter month", () => {
    expect(addMonths(date("2026-08-31"), 6)).toEqual(date("2027-02-28"));
    expect(addMonths(date("2027-08-31"), 6)).toEqual(date("2028-02-29"));
    expect(addMonths(date("2026-12-15"), 1)).toEqual(date("2027-01-15"));
  });

  it("has no end without a ship date or a warranty", () => {
    expect(warrantyEndDate(null, 12)).toBeNull();
    expect(warrantyEndDate(date("2026-10-06"), null)).toBeNull();
    expect(warrantyEndDate(date("2026-10-06"), 0)).toBeNull();
  });
});

describe("warranty length", () => {
  it("uses the customer's contract before the model's standard warranty", () => {
    expect(standardWarrantyMonths({ contractMonths: 24, modelMonths: 6 })).toBe(24);
    expect(standardWarrantyMonths({ contractMonths: null, modelMonths: 6 })).toBe(6);
    expect(standardWarrantyMonths({ contractMonths: null, modelMonths: null })).toBeNull();
  });

  it("reads naturally", () => {
    expect(warrantyLengthLabel(1)).toBe("1 month");
    expect(warrantyLengthLabel(6)).toBe("6 months");
    expect(warrantyLengthLabel(12)).toBe("12 months");
    expect(warrantyLengthLabel(24)).toBe("2 years");
  });
});

describe("warranty state", () => {
  it("covers the end date itself and expires the day after", () => {
    expect(warrantyState(date("2027-04-06"), date("2027-04-06"))).toBe("active");
    expect(warrantyState(date("2027-04-06"), date("2027-04-07"))).toBe("expired");
    expect(warrantyState(null, date("2027-04-07"))).toBe("none");
  });

  it("takes today from the shop's time zone, not the server's", () => {
    // 03:00 UTC on the 7th is still the evening of the 6th in Arizona.
    expect(shopToday(new Date("2026-10-07T03:00:00.000Z"))).toEqual(date("2026-10-06"));
  });
});
