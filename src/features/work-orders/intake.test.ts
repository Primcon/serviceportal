import { describe, expect, it } from "vitest";
import { modelDisplayName, wipNumber, wipSequenceNumber } from "./intake";

describe("wipNumber", () => {
  it("adds the service center code the way the job order form shows it", () => {
    expect(wipNumber("48366", "AZ")).toBe("48366 AZ");
    expect(wipNumber("  48366  ", "AZ")).toBe("48366 AZ");
  });

  it("doesn't add the code twice, and normalizes its case", () => {
    expect(wipNumber("48366 AZ", "AZ")).toBe("48366 AZ");
    expect(wipNumber("48366 az", "AZ")).toBe("48366 AZ");
  });

  it("keeps the number as typed when there's no service center", () => {
    expect(wipNumber("RMA 22-104", null)).toBe("RMA 22-104");
  });
});

describe("wipSequenceNumber", () => {
  it("reads the counted part of a WIP number", () => {
    expect(wipSequenceNumber("48366 AZ")).toBe(48366);
    expect(wipSequenceNumber(" 48366")).toBe(48366);
    expect(wipSequenceNumber("RMA 22-104")).toBeNull();
  });
});

describe("modelDisplayName", () => {
  it("joins manufacturer and model", () => {
    expect(modelDisplayName("Edwards", "IL70N")).toBe("Edwards IL70N");
    expect(modelDisplayName(null, "R5")).toBe("R5");
    expect(modelDisplayName(" ", " R5 ")).toBe("R5");
  });
});
