import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AccessDeniedError, UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";

describe("runAction", () => {
  it("reports success, with an optional message", async () => {
    await expect(runAction(async () => {})).resolves.toEqual({ status: "success" });
    await expect(runAction(async () => "3 photos uploaded.")).resolves.toEqual({ status: "success", message: "3 photos uploaded." });
  });

  it("returns user-facing error messages, including access errors", async () => {
    await expect(runAction(async () => { throw new UserFacingError("Company not found."); })).resolves.toEqual({ status: "error", message: "Company not found." });
    await expect(runAction(async () => { throw new AccessDeniedError("Your account is inactive."); })).resolves.toEqual({ status: "error", message: "Your account is inactive." });
  });

  it("maps validation errors to fields, treating empty required text as missing", async () => {
    const schema = z.object({ name: z.string().trim().min(1), email: z.string().email("Enter a valid email address.") });
    const result = await runAction(async () => { schema.parse({ name: " ", email: "nope" }); });
    expect(result).toEqual({
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { name: "This field is required.", email: "Enter a valid email address." },
    });
  });

  it("explains unique-constraint conflicts without leaking database details", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("Unique constraint failed on WorkOrder", { code: "P2002", clientVersion: "test" });
    await expect(runAction(async () => { throw conflict; })).resolves.toEqual({ status: "error", message: "A record with these details already exists." });
  });

  it("hides unexpected errors behind a generic message and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAction(async () => { throw new Error("connection string postgres://secret"); });
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).not.toContain("secret");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
