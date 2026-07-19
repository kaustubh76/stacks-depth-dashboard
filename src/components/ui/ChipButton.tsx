import type { ReactNode } from "react";

// The chip-button recipe every panel uses, as a shared primitive (new code only — the
// hand-rolled chips in older panels are left untouched to avoid churn).

export function ChipButton({
  active = false,
  onClick,
  children,
  title,
  ariaLabel,
  size = "sm",
  className = "",
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const pad = size === "md" ? "px-2.5 py-1" : "px-2 py-0.5";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`rounded-sm border ${pad} font-mono text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
        active ? "border-brand bg-brand/10 text-brand" : "border-edge text-muted hover:border-brand hover:text-brand"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** The one loud call-to-action style (planner's "Plan this move"). */
export function PrimaryButton({
  onClick,
  children,
  ariaLabel,
  className = "",
}: {
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`rounded-sm border-3 border-[color:var(--thick-line)] bg-brand/10 px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-brand shadow-brut-sm transition hover:-translate-y-0.5 hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${className}`}
    >
      {children}
    </button>
  );
}
