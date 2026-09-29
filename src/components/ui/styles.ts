/**
 * Class names for the portal's shared controls. Use these instead of writing button and
 * field styles by hand, so every screen looks and behaves the same. They work on any
 * element: a <button>, a <Link>, or a form control.
 */

type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

const buttonBase = "inline-flex items-center justify-center gap-2 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "bg-ink text-white hover:bg-body",
  outline: "border border-ink text-ink hover:border-brand hover:text-brand",
  danger: "border border-danger text-danger hover:bg-danger-soft",
  ghost: "text-muted hover:text-brand",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2.5 text-sm",
};

export function buttonStyles({ variant = "primary", size = "md", className = "" }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`.trim();
}

/** Text inputs, selects and textareas. */
export const fieldStyles = "w-full border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand aria-[invalid=true]:border-danger";

/** A bordered white block that groups related content. */
export const panelStyles = "border border-line bg-paper p-6";

/** Small uppercase label above a heading or value. */
export const eyebrowStyles = "text-sm font-bold tracking-[0.1em] text-brand";
