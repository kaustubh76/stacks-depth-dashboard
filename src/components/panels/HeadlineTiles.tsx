import type { Summary, Verdict } from "../../api/types";
import InfoTip from "../ui/Tooltip";
import CountUp from "../ui/CountUp";
import { usd0, int } from "../../lib/format";

interface Tile {
  label: string;
  value: number;
  format: (n: number) => string;
  plain: string;
  color?: string;
  glow?: boolean;
  tip?: { title: string; text: string };
}

/** The six headline numbers (the published snapshot), each counting up on first view. */
export default function HeadlineTiles({ summary, verdict }: { summary: Summary; verdict: Verdict }) {
  const tiles: Tile[] = [
    { label: "Pools tracked", value: summary.pools_total, format: int, plain: "ALEX · Velar · Bitflow" },
    { label: "Trading in 24h", value: summary.pools_live, format: int, plain: `${Math.round((summary.pools_live / summary.pools_total) * 100)}% of pools are live`, color: "#43b581" },
    { label: "Total TVL", value: summary.tvl_usd_total, format: usd0, plain: "on-chain reserves" },
    {
      label: "Clean 24h volume",
      value: summary.volume_24h_usd_clean,
      format: usd0,
      plain: "whole ecosystem, ex-flagged",
      tip: { title: "Clean volume", text: "Total reported 24h volume minus flagged data-quality outliers (see the data-quality panel)." },
    },
    { label: "Movable @ ≤2%", value: verdict.movable_at_2pct_usd, format: usd0, plain: "before 2% slippage", color: "#38b2c4", glow: true },
    { label: "Tradeable assets", value: verdict.n_tradeable_assets, format: int, plain: `clearing a ${usd0(verdict.thresholds.min_asset_depth_2pct_usd)} depth bar`, color: verdict.n_tradeable_assets >= verdict.thresholds.min_independent_assets ? "#43b581" : "#d9a23a" },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="glow-card p-4">
          <div className="flex items-center gap-1.5">
            <span className="card-label">{t.label}</span>
            {t.tip && <InfoTip title={t.tip.title} text={t.tip.text} side="bottom" />}
          </div>
          <div
            className={`mt-1.5 font-display text-2xl font-bold leading-none tabular-nums ${t.glow ? "metric-glow" : ""}`}
            style={t.color ? { color: t.color } : undefined}
          >
            <CountUp value={t.value} format={t.format} />
          </div>
          <div className="mt-1.5 text-[12px] leading-snug text-sub">{t.plain}</div>
        </div>
      ))}
    </div>
  );
}
