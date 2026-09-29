import { describe, expect, it } from "vitest";
import { displayNameForPerson, firstUsableNamePart, normalizeNamePart } from "./person-name";

describe("person names", () => {
  it("trims usable first and last names and rejects placeholders", () => {
    expect(normalizeNamePart("  Avery  ")).toBe("Avery");
    expect(normalizeNamePart(" UNKNOWN ")).toBeNull();
    expect(normalizeNamePart("   ")).toBeNull();
  });

  it("builds the display name from the available canonical fields", () => {
    expect(displayNameForPerson("Avery", "Ng", "avery@example.test")).toBe("Avery Ng");
    expect(displayNameForPerson("Avery", null, "avery@example.test")).toBe("Avery");
    expect(displayNameForPerson(null, "Ng", "avery@example.test")).toBe("Ng");
    expect(displayNameForPerson(null, null, "avery@example.test")).toBe("avery@example.test");
  });

  it("uses the first usable canonical claim across trusted OIDC profile sources", () => {
    expect(firstUsableNamePart(" unknown ", " Logan ")).toBe("Logan");
    expect(firstUsableNamePart(" ", "unknown")).toBeNull();
  });
});