import type { Summary, Verdict } from "../../api/types";
import Stat from "../ui/Stat";
import { usd0, int, pct } from "../../lib/format";

/** The six headline numbers, each a Stat tile in its own card. */
export default function HeadlineTiles({ summary, verdict }: { summary: Summary; verdict: Verdict }) {
  const tiles = [
    {
      label: "Pools tracked",
      value: int(summary.pools_total),
      plain: "ALEX · Velar · Bitflow",
    },
    {
      label: "Trading in 24h",
      value: int(summary.pools_live),
      plain: `${pct(summary.pools_live / summary.pools_total)} of pools are live`,
      color: "#43b581",
    },
    {
      label: "Total TVL",
      value: usd0(summary.tvl_usd_total),
      plain: "on-chain reserves",
    },
    {
      label: "Clean 24h volume",
      value: usd0(summary.volume_24h_usd_clean),
      plain: "whole ecosystem, ex-flagged",
      tip: {
        title: "Clean volume",
        text: "Total reported 24h volume minus flagged data-quality outliers (see the data-quality panel).",
      },
    },
    {
      label: "Movable @ ≤2%",
      value: usd0(verdict.movable_at_2pct_usd),
      plain: "before 2% slippage",
      color: "#38b2c4",
      glow: true,
    },
    {
      label: "Tradeable assets",
      value: int(verdict.n_tradeable_assets),
      plain: `clearing a ${usd0(verdict.thresholds.min_asset_depth_2pct_usd)} depth bar`,
      color: verdict.n_tradeable_assets >= verdict.thresholds.min_independent_assets ? "#43b581" : "#d9a23a",
    },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="glow-card p-4">
          <Stat
            label={t.label}
            value={t.value}
            plain={t.plain}
            size="md"
            color={t.color}
            glow={t.glow}
            tip={t.tip}
          />
        </div>
      ))}
    </div>
  );
}
