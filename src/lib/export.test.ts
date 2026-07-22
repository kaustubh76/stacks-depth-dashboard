import { describe, it, expect } from "vitest";

import { poolsCsv, buildScenario, scenarioJson, scenarioSummary, venuesCsv, backtestCsv, assetDepthCsv, dataQualityJson } from "./export";
import type { ScenarioExport } from "./export";
import { planTrade, recomputeVerdict } from "./depth";
import type { DepthLadder, Study, Summary } from "../api/types";
import laddersJson from "../data/depth_ladders.json";
import studyJson from "../data/study.json";
import summaryJson from "../data/summary.json";

const L = laddersJson as unknown as DepthLadder[];
const S = studyJson as unknown as Study;
const SUM = summaryJson as unknown as Summary;

describe("export.ts poolsCsv (+ csvEscape via injection)", () => {
  it("header + one row per ladder + trailing newline", () => {
    const csv = poolsCsv(L, 0.02);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("pool_key,venue,pool_id,symbol,major_symbol,tvl_usd,depth_2pct_usd,max_trade_usd_at_budget,budget");
    expect(lines.length).toBe(L.length + 1);
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("quotes fields with commas + doubles internal quotes", () => {
    const l: DepthLadder = { venue: "v", pool_id: "p", symbol: 'A,B"C', major_symbol: "STX", tvl_usd: 1, depth_2pct_usd: 1, points: [{ notional: 100, slippage: 0.01 }] };
    expect(poolsCsv([l], 0.02).trim().split("\n")[1]).toContain('"A,B""C"');
  });
});

describe("export.ts buildScenario / scenarioJson", () => {
  it("buildScenario mirrors planTrade + recomputeVerdict on the committed snapshot", () => {
    const s = buildScenario(L, SUM, S, 0.02, 10000, "STX");
    expect(s.as_of).toBe(SUM.as_of_date);
    expect(s.plan).toEqual(planTrade(L, "STX", 10000, 0.02));
    expect(s.verdict).toEqual(recomputeVerdict(L, 0.02, S.verdict.thresholds));
    expect(s.note).toContain(SUM.as_of_date);
  });

  it("scenarioJson round-trips", () => {
    const s = buildScenario(L, SUM, S, 0.02, 10000, "STX");
    expect(JSON.parse(scenarioJson(s))).toEqual(s);
  });
});

const scen = (over: Partial<ScenarioExport> = {}): ScenarioExport => ({
  as_of: "2026-01-01", budget: 0.02, move_x: 10000, asset: "STX",
  plan: { asset: "STX", size: 10000, budget: 0.02, best: null, split: null, verdict: "no-fill" },
  verdict: { budget: 0.02, movable: 91000, deepestUsd: 51000, tradeable: ["STX", "sBTC"], nTradeable: 2, rotationViable: false },
  official_thresholds: { deploy_target_usd: 50000, min_asset_depth_2pct_usd: 10000, min_independent_assets: 3 },
  note: "n", ...over,
});

describe("export.ts scenarioSummary branches", () => {
  it("no-fill + always appends the share link + verdict", () => {
    const out = scenarioSummary(scen(), "https://x/#b=0.02");
    expect(out).toContain("no pool can fill it at ≤ budget");
    expect(out.endsWith("https://x/#b=0.02")).toBe(true);
    expect(out).toContain("rotation not viable");
  });

  it("single-pool route", () => {
    const out = scenarioSummary(
      scen({ plan: { asset: "STX", size: 10000, budget: 0.02, verdict: "single", split: null, best: { leg: { key: "k", venue: "bitflow", symbol: "STX-stSTX", notional: 10000, slippage: 0.004 }, feasible: true, withinBudget: true } } }),
      "L",
    );
    expect(out).toContain("best route bitflow STX-stSTX at 0.40% slippage");
  });
});

describe("export.ts venuesCsv / backtestCsv / assetDepthCsv / dataQualityJson", () => {
  it("venuesCsv: header + bitflow-first order + 4 lines", () => {
    const lines = venuesCsv(SUM).trim().split("\n");
    expect(lines[0]).toBe("venue,pools,live,dead,dormant,tvl_usd,volume_24h_usd_dex,swaps_24h");
    expect(lines[1].startsWith("bitflow,")).toBe(true);
    expect(lines.length).toBe(4);
  });

  it("backtestCsv: sorted by one_way asc, does not mutate the audit", () => {
    const before = S.audit.results.map((r) => r.one_way);
    const lines = backtestCsv(S.audit).trim().split("\n");
    expect(lines[0]).toBe("one_way,total_return,max_dd,median_weekly_ret,pct_windows_up,n_windows");
    expect(lines.length).toBe(S.audit.results.length + 1);
    expect(Number(lines[1].split(",")[0])).toBe(Math.min(...before));
    expect(S.audit.results.map((r) => r.one_way)).toEqual(before);
  });

  it("assetDepthCsv: dynamic header + missing bucket keys → 0", () => {
    const lines = assetDepthCsv({ STX: { "0.020": 5 } }, { STX: 7 }, 0.02).trim().split("\n");
    expect(lines[0]).toBe("asset,movable_0.5pct,movable_1pct,movable_2pct,movable_5pct,movable_at_2.00pct");
    expect(lines[1]).toBe("STX,0,0,5,0,7");
  });

  it("dataQualityJson: round-trips with the expected keys", () => {
    const o = JSON.parse(dataQualityJson(SUM));
    expect(Object.keys(o).sort()).toEqual(
      ["as_of", "flagged_pools", "price_disagreements", "volume_24h_usd_clean", "volume_24h_usd_dex_total", "volume_24h_usd_flagged", "volume_24h_usd_total"].sort(),
    );
    expect(o.as_of).toBe(SUM.as_of_date);
  });
});
