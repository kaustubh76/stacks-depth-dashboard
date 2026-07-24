import type { HistoryPoint } from "../../api/types";
import Card from "../ui/Card";
import Sparkline from "../ui/Sparkline";
import { usd0, usdCompact, signedPct, int } from "../../lib/format";
import { UP, DOWN, MUTED } from "../../lib/colors";

// Depth over time. Every 6h harvest appends one real measured point to src/data/history.json
// (git-backfilled to seed the earliest ones), so this turns the single-snapshot verdict into a
// moving instrument: is the movable liquidity actually getting deeper, or is the ceiling holding?
// All points are real — no synthetic fill. With <2 points the sparklines render "collecting…".

/** First→last change as a fraction, or null when there aren't two points (or the base is 0). */
function delta(series: number[]): number | null {
  if (series.length < 2) return null;
  const a = series[0];
  const b = series[series.length - 1];
  if (!a) return null;
  return (b - a) / a;
}

/** MUTED when flat (|Δ| < 0.5%) or unknown; else green up / rose down. Colours are AA in both themes. */
function deltaColor(frac: number | null): string {
  if (frac === null || Math.abs(frac) < 0.005) return MUTED;
  return frac > 0 ? UP : DOWN;
}

/** signedPct, but a value that rounds to ±0.0% renders as "≈flat" — never a confusing "-0.0%". */
function pctLabel(frac: number | null): string {
  if (frac === null) return "—";
  const s = signedPct(frac);
  return /^[+-]0\.0%$/.test(s) ? "≈flat" : s;
}

function DeltaLabel({ frac }: { frac: number | null }) {
  return (
    <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: deltaColor(frac) }}>
      {pctLabel(frac)}
    </span>
  );
}

/** One secondary metric: label · sparkline · current value · Δ-since-first. */
function TrendRow({ label, series, now }: { label: string; series: number[]; now: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-edge/50 py-2">
      <span className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <div className="min-w-0 flex-1">
        <Sparkline data={series} height={24} fill={false} />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-[13px] font-bold tabular-nums text-ink">{now}</span>
      <span className="w-14 shrink-0 text-right">
        <DeltaLabel frac={delta(series)} />
      </span>
    </div>
  );
}

/** Real time-series of the finding — movable/TVL/volume/tradeable across every harvest. */
export default function DepthTrend({ history }: { history: HistoryPoint[] }) {
  const pts = Array.isArray(history) ? history : [];
  const n = pts.length;

  if (n === 0) {
    return (
      <Card label="Depth over time — the finding, tracked every harvest" tier="supporting">
        <p className="font-mono text-[12px] text-muted">collecting… the first harvest seeds the trend.</p>
      </Card>
    );
  }

  const first = pts[0];
  const last = pts[n - 1];

  const movable = pts.map((p) => p.movable_at_2pct_usd);
  const tvl = pts.map((p) => p.tvl_usd_total);
  const vol = pts.map((p) => p.volume_24h_usd_clean);
  const tradeable = pts.map((p) => p.n_tradeable_assets);

  const dMovable = delta(movable);
  const diffMovable = last.movable_at_2pct_usd - first.movable_at_2pct_usd;
  const notViable = pts.filter((p) => !p.rotation_viable).length;
  const minAssets = Math.min(...tradeable);
  const maxAssets = Math.max(...tradeable);
  const assetsFlat = minAssets === maxAssets;

  return (
    <Card label="Depth over time — the finding, tracked every harvest" tier="supporting">
      <p className="mb-3 text-[12px] leading-snug text-muted">
        {n} harvest{n === 1 ? "" : "s"} since {first.as_of_date} — real measured points, one per harvest date
        (git-backfilled, then extended every 6h).
      </p>

      {/* Headline metric: how much can actually move at ≤2% slippage, over time. */}
      <div className="mb-1 flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wide text-muted">movable @ ≤2% slippage</div>
          <div className="font-display text-3xl font-black tabular-nums text-ink">{usd0(last.movable_at_2pct_usd)}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[11px] uppercase tracking-wide text-muted">since {first.as_of_date}</div>
          <div className="font-mono text-sm font-bold tabular-nums" style={{ color: deltaColor(dMovable) }}>
            {dMovable === null
              ? "first harvest"
              : `${pctLabel(dMovable)} · ${diffMovable >= 0 ? "+" : "−"}${usd0(Math.abs(diffMovable))}`}
          </div>
        </div>
      </div>
      <Sparkline data={movable} height={44} color="auto" />

      {/* Secondary series — market structure around the finding. */}
      <div className="mt-4">
        <TrendRow label="TVL" series={tvl} now={usdCompact(last.tvl_usd_total)} />
        <TrendRow label="24h volume" series={vol} now={usd0(last.volume_24h_usd_clean)} />
        <TrendRow label="tradeable assets" series={tradeable} now={int(last.n_tradeable_assets)} />
      </div>

      {/* The finding, over time — computed from the series, stated honestly. */}
      <p className="mt-4 border-t border-edge pt-3 text-[12px] leading-snug text-muted">
        Rotation was{" "}
        <span className="font-bold" style={{ color: DOWN }}>
          not viable in {notViable}/{n}
        </span>{" "}
        harvest{n === 1 ? "" : "s"}
        {assetsFlat && (
          <>
            {" "}
            · tradeable assets flat at <span className="font-bold text-ink">{minAssets}</span>
          </>
        )}{" "}
        — the movable liquidity isn&rsquo;t materially improving. Depth, not price, remains the ceiling.
      </p>
    </Card>
  );
}
