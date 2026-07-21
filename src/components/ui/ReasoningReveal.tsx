import { useState, type ReactNode } from "react";

import { traceClaim } from "../../lib/sections";

/**
 * A collapsed-by-default "reasoning" disclosure: a chip that expands to reveal the REAL derivation
 * and sources behind a number (not prose — the actual claims + math). Progressive disclosure keeps
 * the surface calm while putting the "why" one click away. No animation lib (instant open) so it's
 * reduced-motion-safe and works even inside a CSS-hidden SectionBand.
 */
export default function ReasoningReveal({
  label,
  icon = "?",
  children,
  defaultOpen = false,
  className = "",
}: {
  label: string;
  icon?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-sm border border-edge px-2.5 py-1 font-mono text-[11px] text-sub transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <span aria-hidden className="font-display font-bold text-brand">
          {icon}
        </span>
        {label}
        <span aria-hidden className="text-[9px] text-muted">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="mt-2 rounded-sm border border-cool/30 bg-cool/5 p-3 text-[12px] leading-relaxed text-sub">
          {children}
        </div>
      )}
    </div>
  );
}

/** A small "trace → source" chip that deep-links to the matching Provenance claim row. */
export function TraceChip({ claimKey, label = "trace →" }: { claimKey: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => traceClaim(claimKey)}
      title={`Show the source claim (${claimKey}) in Provenance`}
      aria-label={`Trace ${claimKey} to its source in the evidence`}
      className="ml-1 inline-flex items-center rounded-sm border border-edge px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      {label}
    </button>
  );
}
