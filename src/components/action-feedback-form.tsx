"use client";

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import { ZodError } from "zod";

type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

type ServerAction = (formData: FormData) => Promise<void>;
type ClientValidationResult = { message: string; fieldErrors?: Record<string, string> } | undefined;

function validationErrors(error: unknown) {
  const issues = error instanceof ZodError
    ? error.issues
    : error instanceof Error ? (() => {
      try {
        const parsed = JSON.parse(error.message);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    })() : undefined;
  if (!issues) return undefined;
  const errors = issues.reduce<Record<string, string>>((fieldErrors, issue) => {
    if (typeof issue !== "object" || issue === null || !("path" in issue) || !("message" in issue)) return fieldErrors;
    const path = issue.path;
    const message = issue.message;
    const fieldName = Array.isArray(path) ? path[0] : undefined;
    if (typeof fieldName === "string" && typeof message === "string" && !fieldErrors[fieldName]) {
      fieldErrors[fieldName] = message.includes("expected string to have >=1 characters") ? "This field is required." : message;
    }
    return fieldErrors;
  }, {});
  return Object.keys(errors).length ? errors : undefined;
}

export default function ActionFeedbackForm({
  action,
  children,
  className,
  feedbackClassName,
  successMessage = "Saved.",
  validate,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  feedbackClassName?: string;
  successMessage?: string;
  validate?: (formData: FormData) => ClientValidationResult;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const errorId = useId();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (_previousState, formData) => {
    const validationResult = validate?.(formData);
    if (validationResult) {
      return { status: "error", ...validationResult };
    }
    try {
      await action(formData);
      return { status: "success", message: successMessage };
    } catch (error) {
      const fieldErrors = validationErrors(error);
      return {
        status: "error",
        message: fieldErrors ? "Check the highlighted fields and try again." : error instanceof Error ? error.message : "Unable to complete this action.",
        fieldErrors,
      };
    }
  }, { status: "idle" });

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    form.querySelectorAll<HTMLElement>("[data-action-feedback-error]").forEach((field) => {
      field.removeAttribute("aria-invalid");
      const describedBy = field.getAttribute("aria-describedby")?.split(" ").filter((id) => !id.startsWith(`${errorId}-`)).join(" ");
      if (describedBy) field.setAttribute("aria-describedby", describedBy);
      else field.removeAttribute("aria-describedby");
      field.removeAttribute("data-action-feedback-error");
    });
    const firstInvalidField = Object.entries(state.fieldErrors ?? {}).map(([fieldName]) => {
      const field = form.querySelector<HTMLElement>(`[name="${fieldName}"]`);
      if (!field) return null;
      const fieldErrorId = `${errorId}-${fieldName}`;
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", [field.getAttribute("aria-describedby"), fieldErrorId].filter(Boolean).join(" "));
      field.setAttribute("data-action-feedback-error", "true");
      return field;
    }).find(Boolean);
    firstInvalidField?.focus();
  }, [errorId, state.fieldErrors]);

  return (
    <form action={formAction} className={className} noValidate ref={formRef}>
      {children}
      {pending && <p className={`text-xs text-[#5a5a5a] ${feedbackClassName ?? ""}`} aria-live="polite">Saving...</p>}
      {!pending && state.message && <div className={`${state.status === "error" ? "basis-full text-xs font-bold text-[#b42318]" : "basis-full text-xs font-bold text-[#ea3435]"} ${feedbackClassName ?? ""}`} role={state.status === "error" ? "alert" : "status"}>{state.message !== Object.values(state.fieldErrors ?? {})[0] && <p>{state.message}</p>}{state.fieldErrors && <ul className={state.message === Object.values(state.fieldErrors)[0] ? "grid gap-1" : "mt-2 grid gap-1"}>{Object.entries(state.fieldErrors).map(([fieldName, message]) => <li id={`${errorId}-${fieldName}`} key={fieldName}>{message}</li>)}</ul>}</div>}
    </form>
  );
}
