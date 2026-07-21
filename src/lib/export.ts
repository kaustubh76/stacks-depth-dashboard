// Client-side export helpers: CSV/JSON downloads and the copyable scenario blurb.
// Everything is recomputed statelessly from the frozen ladders at export time — the
// snapshot is the only source of truth (never live feeds). `downloadText` must only
// ever be called from event handlers (StrictMode double-invokes effects).

import type { Audit, DepthLadder, Study, Summary, Verdict } from "../api/types";
import type { RecomputedVerdict, TradePlan } from "./depth";
import { maxNotionalAt, planTrade, poolKey, recomputeVerdict } from "./depth";
import { pct, usd0 } from "./format";

/** Trigger a browser download of `text` as `filename`. Event-handler-only. */
export function downloadText(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvEscape = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** All 56 ladders as CSV, with a live max-trade column at the caller's budget. */
export function poolsCsv(ladders: DepthLadder[], budget: number): string {
  const header = "pool_key,venue,pool_id,symbol,major_symbol,tvl_usd,depth_2pct_usd,max_trade_usd_at_budget,budget";
  const rows = ladders
    .map((l) => ({ l, max: maxNotionalAt(l.points, budget) }))
    .sort((a, b) => b.max - a.max)
    .map(({ l, max }) =>
      [poolKey(l), l.venue, l.pool_id, l.symbol, l.major_symbol, l.tvl_usd, l.depth_2pct_usd, max, budget]
        .map(csvEscape)
        .join(","),
    );
  return [header, ...rows].join("\n") + "\n";
}

export interface ScenarioExport {
  as_of: string;
  budget: number;
  move_x: number;
  asset: string;
  plan: TradePlan;
  verdict: RecomputedVerdict;
  official_thresholds: Verdict["thresholds"];
  note: string;
}

/** The current scenario, recomputed from the frozen snapshot (no committed-plan state needed). */
export function buildScenario(
  ladders: DepthLadder[],
  summary: Summary,
  study: Study,
  budget: number,
  moveX: number,
  asset: string,
): ScenarioExport {
  return {
    as_of: summary.as_of_date,
    budget,
    move_x: moveX,
    asset,
    plan: planTrade(ladders, asset, moveX, budget),
    verdict: recomputeVerdict(ladders, budget, study.verdict.thresholds),
    official_thresholds: study.verdict.thresholds,
    note: `Recomputed client-side from the committed ${summary.as_of_date} depth ladders (snapshot, not live).`,
  };
}

export const scenarioJson = (s: ScenarioExport): string => JSON.stringify(s, null, 2);

/** Human-readable one-paragraph summary of the current scenario (for copy-to-clipboard). */
export function scenarioSummary(s: ScenarioExport, shareLink: string): string {
  const { plan, verdict } = s;
  let route: string;
  if (plan.verdict === "single" && plan.best) {
    route = `best route ${plan.best.leg.venue} ${plan.best.leg.symbol} at ${pct(plan.best.leg.slippage, 2)} slippage`;
  } else if (plan.verdict === "split" && plan.split) {
    route = `splits across ${plan.split.legs.length} pools at ${pct(plan.split.avgSlippage, 2)} blended slippage`;
  } else if (plan.verdict === "partial" && plan.split) {
    route = `only ${usd0(plan.split.filled)} fillable at ≤ budget (${usd0(plan.split.unfilled)} unfilled)`;
  } else {
    route = "no pool can fill it at ≤ budget";
  }
  return (
    `Stacks Depth scenario (snapshot ${s.as_of}): move ${usd0(s.move_x)} of ${s.asset} at ≤${pct(s.budget, 2)} — ${route}. ` +
    `Ecosystem: ${usd0(verdict.movable)} movable at this budget, ${verdict.nTradeable} tradeable asset(s) ` +
    `[${verdict.tradeable.join(", ") || "none"}], rotation ${verdict.rotationViable ? "viable" : "not viable"}. ${shareLink}`
  );
}

/** Per-venue market structure as CSV (evidence-panel export). */
export function venuesCsv(summary: Summary): string {
  const header = "venue,pools,live,dead,dormant,tvl_usd,volume_24h_usd_dex,swaps_24h";
  const order: (keyof Summary["venues"])[] = ["bitflow", "alex", "velar"];
  const rows = order
    .filter((n) => summary.venues[n])
    .map((n) => {
      const v = summary.venues[n];
      return [n, v.pools, v.live, v.dead, v.dormant, v.tvl_usd, v.volume_24h_usd_dex, v.swaps_24h].map(csvEscape).join(",");
    });
  return [header, ...rows].join("\n") + "\n";
}

/** Rotation backtest results as CSV (one row per friction level). */
export function backtestCsv(audit: Audit): string {
  const header = "one_way,total_return,max_dd,median_weekly_ret,pct_windows_up,n_windows";
  const rows = [...audit.results]
    .sort((a, b) => a.one_way - b.one_way)
    .map((r) => [r.one_way, r.total_return, r.max_dd, r.median_weekly_ret, r.pct_windows_up, r.n_windows].map(csvEscape).join(","));
  return [header, ...rows].join("\n") + "\n";
}

/** Per-asset movable USD at each measured budget + a live column at the caller's budget, as CSV. */
export function assetDepthCsv(
  byAsset: Record<string, Record<string, number>>,
  live: Record<string, number>,
  budget: number,
): string {
  const header = `asset,movable_0.5pct,movable_1pct,movable_2pct,movable_5pct,movable_at_${(budget * 100).toFixed(2)}pct`;
  const rows = Object.entries(byAsset).map(([asset, b]) =>
    [asset, b["0.005"] ?? 0, b["0.010"] ?? 0, b["0.020"] ?? 0, b["0.050"] ?? 0, live[asset] ?? 0].map(csvEscape).join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}

/** The data-quality summary (flagged pools + cross-feed disagreements) as JSON. */
export function dataQualityJson(summary: Summary): string {
  return JSON.stringify(
    {
      as_of: summary.as_of_date,
      volume_24h_usd_clean: summary.volume_24h_usd_clean,
      volume_24h_usd_total: summary.volume_24h_usd_total,
      volume_24h_usd_flagged: summary.volume_24h_usd_flagged,
      volume_24h_usd_dex_total: summary.volume_24h_usd_dex_total,
      flagged_pools: summary.flagged_pools,
      price_disagreements: summary.price_disagreements,
    },
    null,
    2,
  );
}
