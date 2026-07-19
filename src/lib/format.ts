// Small presentation helpers shared across the panels.

/** Whole-dollar USD, thousands-separated. Used for headline depth/TVL/volume figures. */
export function usd0(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** USD with a fixed number of decimals. */
export function usd(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

/** A 0..1 fraction as a percent (e.g. 0.02 → "2%"). */
export function pct(frac: number | null | undefined, dp = 0): string {
  if (frac === null || frac === undefined || Number.isNaN(frac)) return "—";
  return `${(frac * 100).toFixed(dp)}%`;
}

/** A 0..1 fraction as a signed percent (e.g. -0.48 → "-48.0%"). */
export function signedPct(frac: number | null | undefined, dp = 1): string {
  if (frac === null || frac === undefined || Number.isNaN(frac)) return "—";
  const s = (frac * 100).toFixed(dp);
  return `${frac >= 0 ? "+" : ""}${s}%`;
}

/** Compact integer with thousands separators. */
export function int(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** Truncate a long digest/hash for display. */
export function shortHash(h: string | null | undefined): string {
  if (!h) return "—";
  if (h.length < 14) return h;
  return `${h.slice(0, 10)}…${h.slice(-4)}`;
}
