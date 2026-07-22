import type { ReactNode } from "react";

export type Tone = "up" | "down" | "warn" | "armed" | "info" | "neutral" | "brand" | "violet";

// Themeable tones reference a CSS var (so the light theme can darken for AA contrast — the pill
// uses inline colours, so this is where the fix must live, not tailwind classes). The rest stay
// inline hex. Dark-theme var values equal the old hex, so dark is byte-identical.
const TONE_VAR: Partial<Record<Tone, string>> = {
  up: "--c-up",
  down: "--c-down",
  warn: "--c-warn",
  armed: "--c-warn", // operational "live-armed" — same colour, distinct meaning from warn
  info: "--c-info",
  neutral: "--c-neutral",
  brand: "--c-brand",
};
const TONE_HEX: Record<Tone, string> = {
  up: "#43b581",
  down: "#e0728a",
  warn: "#d9a23a",
  armed: "#d9a23a",
  info: "#3861fb",
  neutral: "#8a8f9c",
  brand: "#38b2c4",
  violet: "#8b9dff",
};

interface StatusPillProps {
  tone?: Tone;
  /** Show a leading status dot. */
  dot?: boolean;
  /** Pulse the dot (live signals only). */
  pulse?: boolean;
  /** Visually-hidden clarifier so the status is never colour-only. */
  srText?: string;
  className?: string;
  children: ReactNode;
}

/**
 * The one status pill, consolidating the old per-panel Badge/Pill/Dot copies.
 * Always carries a text label (a11y) and an optional dot; square brutalist edges.
 */
export default function StatusPill({ tone = "neutral", dot, pulse, srText, className = "", children }: StatusPillProps) {
  const v = TONE_VAR[tone];
  const color = v ? `rgb(var(${v}))` : TONE_HEX[tone];
  const borderColor = v ? `rgb(var(${v}) / 0.4)` : `${TONE_HEX[tone]}66`;
  const background = v ? `rgb(var(${v}) / 0.08)` : `${TONE_HEX[tone]}14`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${className}`}
      style={{ color, borderColor, background }}
    >
      {dot && (
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${pulse ? "animate-pulseDot" : ""}`}
          style={{ background: color }}
        />
      )}
      {children}
      {srText && <span className="sr-only">{srText}</span>}
    </span>
  );
}
