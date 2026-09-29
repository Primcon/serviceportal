"use client";

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";

type ActionState = { status: "idle" } | ActionResult;

type ServerAction = (formData: FormData) => Promise<ActionResult>;
type ClientValidationResult = { message: string; fieldErrors?: Record<string, string> } | undefined;

const unreachableMessage = "The portal couldn't be reached. Check your connection and try again.";

export default function ActionFeedbackForm({
  action,
  children,
  className,
  feedbackClassName,
  successMessage = "Saved.",
  resetOnSuccess = false,
  validate,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  feedbackClassName?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
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
      const result = await action(formData);
      if (result.status === "success") {
        if (resetOnSuccess) formRef.current?.reset();
        return { status: "success", message: result.message ?? successMessage };
      }
      return result;
    } catch {
      return { status: "error", message: unreachableMessage };
    }
  }, { status: "idle" });

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const message = state.status === "idle" ? undefined : state.message;
  const firstFieldError = fieldErrors ? Object.values(fieldErrors)[0] : undefined;

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
    const firstInvalidField = Object.keys(fieldErrors ?? {}).map((fieldName) => {
      const field = form.querySelector<HTMLElement>(`[name="${fieldName}"]`);
      if (!field) return null;
      const fieldErrorId = `${errorId}-${fieldName}`;
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", [field.getAttribute("aria-describedby"), fieldErrorId].filter(Boolean).join(" "));
      field.setAttribute("data-action-feedback-error", "true");
      return field;
    }).find(Boolean);
    firstInvalidField?.focus();
  }, [errorId, fieldErrors]);

  return (
    <form action={formAction} className={className} noValidate ref={formRef}>
      {children}
      {pending && <p className={`text-xs text-muted ${feedbackClassName ?? ""}`} aria-live="polite">Saving...</p>}
      {!pending && message && (
        <div className={`basis-full text-xs font-bold ${state.status === "error" ? "text-danger" : "text-brand"} ${feedbackClassName ?? ""}`} role={state.status === "error" ? "alert" : "status"}>
          {message !== firstFieldError && <p>{message}</p>}
          {fieldErrors && (
            <ul className={message === firstFieldError ? "grid gap-1" : "mt-2 grid gap-1"}>
              {Object.entries(fieldErrors).map(([fieldName, fieldMessage]) => <li id={`${errorId}-${fieldName}`} key={fieldName}>{fieldMessage}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
