// Small presentation helpers shared across the panels.

/** Whole-dollar USD, thousands-separated. Used for headline depth/TVL/volume figures. */
export function usd0(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Compact USD for large headline figures (e.g. 1_487_377 → "$1.49M"). */
export function usdCompact(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(dp)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(dp)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
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

/** Compact "updated Ns ago" label from a timestamp (ms) vs now (ms). */
export function ago(ts: number | null | undefined, now: number): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

/** Whole days since an ISO date (YYYY-MM-DD), clamped ≥ 0. */
export function daysSince(dateStr: string | null | undefined, now = Date.now()): number {
  if (!dateStr) return 0;
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** Human "measured today / yesterday / N days ago" from a snapshot date. */
export function measuredLabel(dateStr: string | null | undefined, now = Date.now()): string {
  const d = daysSince(dateStr, now);
  return d <= 0 ? "measured today" : d === 1 ? "measured yesterday" : `measured ${d} days ago`;
}

/** Truncate a long digest/hash for display. */
export function shortHash(h: string | null | undefined): string {
  if (!h) return "—";
  if (h.length < 14) return h;
  return `${h.slice(0, 10)}…${h.slice(-4)}`;
}
