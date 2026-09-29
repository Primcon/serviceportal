"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { eyebrowStyles } from "./styles";

const focusableSelector = "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]";

/**
 * A dialog over the current page. Escape or a click outside closes it, focus moves into it
 * when it opens and back to where it was when it closes, and the page behind doesn't scroll.
 */
export function Modal({ eyebrow, title, description, onClose, size = "md", children }: {
  eyebrow?: string;
  title: string;
  description?: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const firstField = dialog?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])");
    (firstField ?? dialog?.querySelector<HTMLElement>(focusableSelector))?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const width = size === "sm" ? "max-w-lg" : size === "lg" ? "max-w-3xl" : "max-w-2xl";
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-5" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`max-h-[calc(100vh-2.5rem)] w-full ${width} overflow-y-auto border border-line bg-paper p-6 shadow-2xl`}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-5 border-b border-line pb-5">
          <div>
            {eyebrow && <p className={eyebrowStyles}>{eyebrow}</p>}
            <h2 className="mt-2 text-2xl font-bold" id={titleId}>{title}</h2>
            {description && <p className="mt-2 text-sm text-muted">{description}</p>}
          </div>
          <button aria-label="Close" className="grid size-10 shrink-0 place-items-center border border-line text-muted hover:border-brand hover:text-brand" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
