import type { HistoryPoint, Verdict } from "../../api/types";
import Card from "../ui/Card";
import Sparkline from "../ui/Sparkline";
import StatusPill from "../ui/StatusPill";
import { usd0, signedPct } from "../../lib/format";
import { UP, DOWN, MUTED } from "../../lib/colors";

// Depth BY ASSET, over time. The finding is per-asset: only 2 of the 3 assets a rotation needs clear the
// $10k depth bar. This trends each asset's movable-@≤2% across every harvest (git-backfilled), so the
// on-mission question is legible — is any asset approaching the bar (is Stacks nearing a 3rd tradeable
// market), or are the two that clear it thinning? All real data; graceful with <2 points ("collecting…").

/** First→last change as a fraction, or null when there aren't two points (or the base is 0). */
function delta(series: number[]): number | null {
  if (series.length < 2) return null;
  const a = series[0];
  const b = series[series.length - 1];
  if (!a) return null;
  return (b - a) / a;
}
function deltaColor(frac: number | null): string {
  if (frac === null || Math.abs(frac) < 0.005) return MUTED;
  return frac > 0 ? UP : DOWN;
}
function pctLabel(frac: number | null): string {
  if (frac === null) return "—";
  const s = signedPct(frac);
  return /^[+-]0\.0%$/.test(s) ? "≈flat" : s;
}
/** 1→"1st", 3→"3rd", etc. */
function nth(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function AssetRow({ symbol, series, now, clears }: { symbol: string; series: number[]; now: number; clears: boolean }) {
  const d = delta(series);
  return (
    <div className="flex items-center gap-3 border-t border-edge/50 py-2">
      <span className="w-14 shrink-0 font-display text-[13px] font-bold text-ink">{symbol}</span>
      <span className="w-16 shrink-0">
        <StatusPill tone={clears ? "up" : "neutral"} srText={clears ? "clears the depth bar" : "below the depth bar"}>
          {clears ? "clears" : "below"}
        </StatusPill>
      </span>
      <div className="min-w-0 flex-1">
        <Sparkline data={series} height={24} fill={false} color={clears ? "#43b581" : "#8a8f9c"} />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-[13px] font-bold tabular-nums text-ink">{usd0(now)}</span>
      <span className="w-14 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums" style={{ color: deltaColor(d) }}>
        {pctLabel(d)}
      </span>
    </div>
  );
}

/** Real per-asset movable-@≤2% time-series + the live gap to a viable rotation. */
export default function DepthByAsset({ history, verdict }: { history: HistoryPoint[]; verdict: Verdict }) {
  const pts = Array.isArray(history) ? history : [];
  const bar = verdict.thresholds.min_asset_depth_2pct_usd;
  const need = verdict.thresholds.min_independent_assets;
  const last = pts[pts.length - 1];
  const assets = last?.by_asset_2pct ? Object.keys(last.by_asset_2pct) : [];

  if (!last || assets.length === 0) {
    return (
      <Card label={`Depth by asset — the gap to a ${nth(need)} market`} tier="supporting">
        <p className="font-mono text-[12px] text-muted">collecting… per-asset depth accumulates each harvest.</p>
      </Card>
    );
  }

  const rows = assets
    .map((a) => ({ a, series: pts.map((p) => p.by_asset_2pct?.[a] ?? 0), now: last.by_asset_2pct?.[a] ?? 0 }))
    .sort((x, y) => y.now - x.now)
    .map((r) => ({ ...r, clears: r.now >= bar }));

  const nClear = rows.filter((r) => r.clears).length;
  const clearingNames = rows.filter((r) => r.clears).map((r) => r.a);
  const third = rows[need - 1]; // the next asset that must clear the bar for viability
  const thirdMult = third && third.now > 0 ? Math.round(bar / third.now) : null;
  const thirdDelta = third ? delta(third.series) : null;
  const thirdTrend =
    thirdDelta === null
      ? ""
      : Math.abs(thirdDelta) < 0.02
        ? " and isn’t trending toward it"
        : thirdDelta > 0
          ? " and is only inching up"
          : " and is thinning, not growing";

  return (
    <Card label={`Depth by asset — the gap to a ${nth(need)} market`} tier="supporting">
      <p className="mb-3 text-[12px] leading-snug text-muted">
        movable @ ≤2% per asset, across {pts.length} harvest{pts.length === 1 ? "" : "s"} — a rotation needs {need}{" "}
        independent assets over the {usd0(bar)} bar.
      </p>

      <div className="mb-1 flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wide text-muted">assets clearing the {usd0(bar)} bar</div>
          <div className="font-display text-3xl font-black tabular-nums text-ink">
            {nClear} <span className="text-lg font-bold text-muted">of {rows.length}</span>
          </div>
        </div>
        {third && (
          <div className="max-w-[62%] text-right">
            <div className="font-mono text-[11px] uppercase tracking-wide text-muted">gap to a {nth(need)} market</div>
            <div className="font-mono text-[12px] leading-snug text-sub">
              {third.a} is the closest below — {usd0(third.now)}, ~<span className="font-bold text-ink">{thirdMult}×</span>{" "}
              short{thirdTrend}.
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        {rows.map((r) => (
          <AssetRow key={r.a} symbol={r.a} series={r.series} now={r.now} clears={r.clears} />
        ))}
      </div>

      <p className="mt-3 border-t border-edge pt-2 text-[12px] leading-snug text-muted">
        {nClear < need
          ? `${need - nClear} more asset${need - nClear === 1 ? "" : "s"} must clear the bar to rotate — the ${nClear} that do (${clearingNames.join(", ")}) are the entire tradeable universe today.`
          : "Enough independent assets clear the bar to rotate."}
      </p>
    </Card>
  );
}
