import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("times shown in the portal", () => {
  // A client component is rendered once on the server (in UTC) and again in the browser (in the
  // viewer's zone). Formatting a time in one makes the two disagree, which breaks the page's
  // first render and shows staff in different places different times. The server formats times
  // in the shop's zone and passes the text down instead.
  it("are never formatted inside a client component", () => {
    const offenders = sourceFiles("src")
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /^\s*["']use client["']/.test(source) && /Intl\.DateTimeFormat|\.toLocale(Date|Time)?String\(/.test(source);
      });
    expect(offenders).toEqual([]);
  });
});
