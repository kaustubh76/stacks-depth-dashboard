// Client-side export helpers: CSV/JSON downloads and the copyable scenario blurb.
// Everything is recomputed statelessly from the frozen ladders at export time — the
// snapshot is the only source of truth (never live feeds). `downloadText` must only
// ever be called from event handlers (StrictMode double-invokes effects).

import type { DepthLadder, Study, Summary, Verdict } from "../api/types";
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
    note: "Recomputed client-side from the committed 2026-07-18 depth ladders (snapshot, not live).",
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
