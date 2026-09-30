import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineInput } from "./timeline";

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 29, 12, minutes));
const riley = { displayName: "Riley Chen" };
const casey = { displayName: "Casey Patel" };

function photo(id: string, minutes: number, uploader: string, category: "ARRIVAL" | "REPAIR", shared = true): TimelineInput["attachments"][number] {
  return { id, kind: "PHOTO", uploadedAt: at(minutes), fileName: `${id}.jpg`, photoCategory: category, documentType: null, visibility: shared ? "CUSTOMER_VISIBLE" : "INTERNAL_ONLY", uploadedById: uploader, uploadedBy: uploader === "riley" ? riley : casey };
}

describe("buildTimeline", () => {
  it("merges every kind of entry, newest first, and marks the intake status", () => {
    const timeline = buildTimeline({
      statusHistory: [
        { id: "s2", createdAt: at(30), condition: "NORMAL", note: "Handing to test bench", serviceStage: { displayName: "Testing", customerFacingStatus: "IN_PROGRESS" }, changedBy: casey },
        { id: "s1", createdAt: at(0), condition: "NORMAL", note: null, serviceStage: { displayName: "Received", customerFacingStatus: "OPEN" }, changedBy: riley },
      ],
      updates: [
        { id: "u1", createdAt: at(20), title: "Rebuild underway", body: "Seals replaced.", visibility: "CUSTOMER_VISIBLE", notifyCustomer: true, createdBy: riley },
        { id: "u2", createdAt: at(25), title: "Internal note", body: "Waiting on bearing kit.", visibility: "INTERNAL_ONLY", notifyCustomer: false, createdBy: riley },
      ],
      findings: [{ id: "f1", createdAt: at(10), title: "Scored rotor", body: "Inlet stage scoring.", visibility: "INTERNAL_ONLY", createdBy: casey }],
      attachments: [],
    });
    expect(timeline.map((entry) => entry.kind)).toEqual(["status", "internal-note", "customer-update", "finding", "status"]);
    expect(timeline.find((entry) => entry.id === "s1")).toMatchObject({ isFirst: true });
    expect(timeline.find((entry) => entry.id === "s2")).toMatchObject({ isFirst: false, note: "Handing to test bench" });
    expect(timeline.find((entry) => entry.id === "u1")).toMatchObject({ emailed: true });
  });

  it("groups photos from the same person and category taken close together", () => {
    const timeline = buildTimeline({
      statusHistory: [],
      updates: [],
      findings: [],
      attachments: [
        photo("p1", 0, "riley", "ARRIVAL"),
        photo("p2", 3, "riley", "ARRIVAL", false),
        photo("p3", 5, "riley", "ARRIVAL"),
        photo("p4", 6, "casey", "ARRIVAL"),
        photo("p5", 7, "riley", "REPAIR"),
        photo("p6", 40, "riley", "ARRIVAL"),
      ],
    });
    const batches = timeline.filter((entry) => entry.kind === "photos");
    expect(batches.map((entry) => entry.photoIds)).toEqual([["p6"], ["p5"], ["p4"], ["p1", "p2", "p3"]]);
    expect(batches.at(-1)).toMatchObject({ sharedCount: 2, actor: "Riley Chen", category: "ARRIVAL" });
  });
});
