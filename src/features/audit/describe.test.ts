import { describe, expect, it } from "vitest";
import { categoryOf, describeDetails, eventTitle } from "./describe";

describe("eventTitle", () => {
  it("names known events plainly and makes unknown ones readable", () => {
    expect(eventTitle("checklist.overridden")).toBe("Manager override: job moved on with steps unsigned");
    expect(eventTitle("equipment.merged")).toBe("Duplicate pump merged in");
    expect(eventTitle("something-new.happened")).toBe("Something new happened");
  });
});

describe("categoryOf", () => {
  it("groups events for the filter", () => {
    expect(categoryOf("work-order.parts-updated")).toBe("work-orders");
    expect(categoryOf("checklist-step.signed")).toBe("checklist");
    expect(categoryOf("model-document.uploaded")).toBe("files");
    expect(categoryOf("user-access.granted")).toBe("access");
    expect(categoryOf("mystery.event")).toBeNull();
  });
});

describe("describeDetails", () => {
  it("shows edits as from and to, with readable labels and values", () => {
    expect(describeDetails({
      promisedAt: { from: null, to: "2026-10-15T00:00:00.000Z" },
      partsKit: { from: "MINOR", to: "MAJOR" },
      extraLaborHours: { from: null, to: 2.5 },
      summary: { from: "Rebuild", to: "Rebuild and test" },
    })).toEqual([
      { label: "Promised date", from: "empty", to: "10/15/2026" },
      { label: "Kit", from: "Minor", to: "Major" },
      { label: "Extra labor hours", from: "empty", to: "2.5" },
      { label: "Summary", from: "Rebuild", to: "Rebuild and test" },
    ]);
  });

  it("shows other details as labelled values and leaves internal IDs out", () => {
    expect(describeDetails({
      reason: "Signed on paper",
      unsignedSteps: ["Teardown", "Leak check"],
      movedTo: "Testing",
      duplicateId: "0d0c5a52-6f0e-4f43-9d3e-0c8f1f3f5a11",
      someRecord: "0d0c5a52-6f0e-4f43-9d3e-0c8f1f3f5a11",
      requiresQa: true,
      originalBytes: 3_145_728,
      changed: ["serialNumber", "locationId"],
    })).toEqual([
      { label: "Reason", value: "Signed on paper" },
      { label: "Unsigned steps", value: "Teardown; Leak check" },
      { label: "Moved to", value: "Testing" },
      { label: "QA only", value: "Yes" },
      { label: "Original size", value: "3.0 MB" },
      { label: "Changed", value: "Serial number, Location" },
    ]);
  });

  it("pairs a previous value with the new one, and leaves typed codes as typed", () => {
    expect(describeDetails({ customerFacingStatus: "WAITING", previousCustomerFacingStatus: "IN_PROGRESS", isActive: true, previousIsActive: true, code: "MQBD" })).toEqual([
      { label: "Customer facing status", from: "In progress", to: "Waiting" },
      { label: "Active", value: "Yes" },
      { label: "Code", value: "MQBD" },
    ]);
    expect(describeDetails({ from: 52798, to: 52898 })).toEqual([{ label: "Value", from: "52798", to: "52898" }]);
    // A previous value with nothing to pair it with is still shown.
    expect(describeDetails({ previousSerialNumber: "A-1", changed: ["serialNumber"] })).toEqual([{ label: "Previous serial", value: "A-1" }, { label: "Changed", value: "Serial number" }]);
  });

  it("copes with events that recorded nothing, and skips the IDs on a handoff", () => {
    expect(describeDetails(null)).toEqual([]);
    expect(describeDetails("text")).toEqual([]);
    expect(describeDetails({ from: null, to: "0d0c5a52-6f0e-4f43-9d3e-0c8f1f3f5a11" })).toEqual([]);
  });
});
