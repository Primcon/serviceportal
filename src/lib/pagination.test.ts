import { describe, expect, it } from "vitest";
import { pageCount, pageFromParams, pageHref, pageWindow } from "./pagination";

describe("pagination helpers", () => {
  it("reads the page number, defaulting to 1 for anything invalid", () => {
    expect(pageFromParams({ page: "3" })).toBe(3);
    expect(pageFromParams({ page: ["2", "5"] })).toBe(2);
    expect(pageFromParams({ page: "0" })).toBe(1);
    expect(pageFromParams({ page: "abc" })).toBe(1);
    expect(pageFromParams({})).toBe(1);
  });

  it("computes the window and page count", () => {
    expect(pageWindow(3, 25)).toEqual({ skip: 50, take: 25 });
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(51, 25)).toBe(3);
  });

  it("keeps filters in page links and drops empty values", () => {
    expect(pageHref("/workspace/work-orders", { search: "IL70N", status: "", page: "2", statuses: ["OPEN", "WAITING"] }, 3)).toBe("/workspace/work-orders?search=IL70N&statuses=OPEN&statuses=WAITING&page=3");
    expect(pageHref("/workspace/work-orders", { search: "IL70N", page: "2" }, 1)).toBe("/workspace/work-orders?search=IL70N");
  });
});
