import { describe, expect, it } from "vitest";
import { customerStageLabel, progressSteps } from "./progress";

const stages = [
  { sequence: 1, displayName: "Received", customerLabel: "Received" },
  { sequence: 2, displayName: "Intake Documentation", customerLabel: "Received" },
  { sequence: 3, displayName: "Initial Inspection", customerLabel: "Inspection" },
  { sequence: 4, displayName: "Repair In Progress", customerLabel: "Repair" },
  { sequence: 5, displayName: "Testing", customerLabel: "Testing" },
  { sequence: 6, displayName: "Completed", customerLabel: "Complete" },
];

describe("progressSteps", () => {
  it("collapses internal stages into the steps a customer sees", () => {
    expect(progressSteps(stages, 4)).toEqual([
      { label: "Received", state: "done" },
      { label: "Inspection", state: "done" },
      { label: "Repair", state: "current" },
      { label: "Testing", state: "upcoming" },
      { label: "Complete", state: "upcoming" },
    ]);
  });

  it("doesn't move when a job moves between stages that share a step", () => {
    expect(progressSteps(stages, 1)[0]).toEqual({ label: "Received", state: "current" });
    expect(progressSteps(stages, 2)[0]).toEqual({ label: "Received", state: "current" });
  });

  it("leaves out retired stages unless the job is sitting in one, and falls back to the stage name", () => {
    const withRetired = [...stages, { sequence: 7, displayName: "Legacy Hold", customerLabel: null, isActive: false }];
    expect(progressSteps(withRetired, 4).map((step) => step.label)).not.toContain("Legacy Hold");
    expect(progressSteps(withRetired, 7).at(-1)).toEqual({ label: "Legacy Hold", state: "current" });
    expect(customerStageLabel({ displayName: "Bench Test", customerLabel: "  " })).toBe("Bench Test");
  });
});
