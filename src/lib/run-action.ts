import { Prisma } from "@prisma/client";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";

const genericFailureMessage = "Something went wrong. Try again, and contact an administrator if it keeps happening.";

function fieldErrorsFrom(error: ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const fieldName = issue.path[0];
    if (typeof fieldName !== "string" || fieldErrors[fieldName]) continue;
    const isEmpty = issue.code === "too_small" && issue.origin === "string" && Number(issue.minimum) <= 1;
    fieldErrors[fieldName] = isEmpty ? "This field is required." : issue.message;
  }
  return fieldErrors;
}

/**
 * Runs a server action and converts expected failures into a result the form can show.
 * Unexpected errors are logged with their details and reported to the user generically.
 */
export async function runAction(work: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await work();
    return message ? { status: "success", message } : { status: "success" };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ZodError) {
      const fieldErrors = fieldErrorsFrom(error);
      // A rule that isn't tied to a named field has nothing to highlight, so show its message.
      if (!Object.keys(fieldErrors).length) return { status: "error", message: error.issues[0]?.message ?? "Check your entries and try again." };
      return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors };
    }
    if (error instanceof UserFacingError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "error", message: "A record with these details already exists." };
    }
    console.error("Server action failed.", error);
    return { status: "error", message: genericFailureMessage };
  }
}
