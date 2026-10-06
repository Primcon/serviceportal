import { describe, expect, it } from "vitest";
import { modelDisplayName, wipSequenceNumber } from "./intake";

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
