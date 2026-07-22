// Semantic status colours as themeable CSS-var references (dark = the current brights; light = a
// darker shade that clears WCAG AA). Use these for inline `style={{ color }}` on TEXT (deltas, table
// numbers, verdict values) so the LIGHT theme stays legible — the dark theme is byte-identical
// because the dark `--c-*` values equal the old hex. These are for TEXT only, NOT chart/data-viz
// fills or decorative accents (those stay bright hex and are exempt from text-contrast rules).
export const UP = "rgb(var(--c-up))"; // green — clears the bar / positive
export const DOWN = "rgb(var(--c-down))"; // rose — shortfall / negative / over budget
export const WARN = "rgb(var(--c-warn))"; // gold — caution
export const MUTED = "rgb(var(--c-muted))"; // de-emphasized grey (was #8a8f9c "no fill")
