import { describe, expect, it } from "vitest";
import { hasContaminants } from "./labels";

describe("hasContaminants", () => {
  it("ignores the ways people write that there are none", () => {
    for (const none of ["NA", "n/a", "N.A.", "none", "None known", "no", "nil", "-", "--", "0", "Not applicable", "  ", "", null]) {
      expect(hasContaminants(none)).toBe(false);
    }
  });

  it("warns for anything that names a contaminant", () => {
    for (const real of ["N2", "Process gas: SiH4", "Nafion residue", "na2s04"]) {
      expect(hasContaminants(real)).toBe(true);
    }
  });
});
