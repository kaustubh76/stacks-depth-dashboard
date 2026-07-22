import { describe, it, expect } from "vitest";

import { slippageTrace, maxNotionalAt, planTrade, viableBudgetThreshold, realizedForNotional } from "./depth";
import type { DepthLadder, SlippagePoint } from "../api/types";

// Hand-built ladders exercise the branches the reproducibility suite (depth.test.ts) can't reach on
// the committed snapshot: planTrade split/partial/no-fill, exact interpolation, non-monotonic rungs,
// and a POSITIVE viableBudgetThreshold (committed data is always null).
const pts = (arr: [number, number][]): SlippagePoint[] => arr.map(([notional, slippage]) => ({ notional, slippage }));
const ladder = (over: Partial<DepthLadder> = {}): DepthLadder => ({
  venue: "v", pool_id: "p", symbol: "S", major_symbol: "STX", tvl_usd: 0, depth_2pct_usd: 0, points: [], ...over,
});

describe("slippageTrace", () => {
  const p = pts([[100, 0], [200, 0.1]]);
  it("interpolates the midpoint exactly", () => {
    const t = slippageTrace(p, 150);
    expect(t.slippage).toBeCloseTo(0.05, 10);
    expect(t.below).toEqual({ notional: 100, slippage: 0 });
    expect(t.above).toEqual({ notional: 200, slippage: 0.1 });
    expect(t.mode).toBe("interp");
  });
  it("below-first / above-last modes", () => {
    expect(slippageTrace(p, 50)).toMatchObject({ mode: "below-first", below: null });
    expect(slippageTrace(p, 500)).toMatchObject({ mode: "above-last", above: null });
  });
  it("sorts unsorted input before tracing", () => {
    expect(slippageTrace(pts([[200, 0.1], [100, 0]]), 150).slippage).toBeCloseTo(0.05, 10);
  });
  it("empty points → slippage 1, below-first", () => {
    expect(slippageTrace([], 100)).toMatchObject({ below: null, above: null, slippage: 1, mode: "below-first" });
  });
});

describe("maxNotionalAt robustness", () => {
  it("counts a deep passing rung even after an over-budget rung (filter, not walk)", () => {
    // ok = {100@0.001}; interp into first failing rung 1000@0.5 at budget 0.02 ≈ 134.27
    const r = maxNotionalAt(pts([[100, 0.001], [1000, 0.5], [2000, 0.6]]), 0.02);
    expect(r).toBeGreaterThan(130);
    expect(r).toBeLessThan(140);
  });
  it("both rungs pass → deepest notional", () => {
    expect(maxNotionalAt(pts([[100, 0.01], [200, 0.005]]), 0.02)).toBe(200);
  });
  it("empty and none-pass → 0", () => {
    expect(maxNotionalAt([], 0.02)).toBe(0);
    expect(maxNotionalAt(pts([[100, 0.5]]), 0.02)).toBe(0);
  });
});

describe("planTrade verdicts", () => {
  it("split: fills across pools when no single pool clears at budget", () => {
    const p = pts([[100, 0], [5000, 0.02], [8000, 0.2]]); // caps ~5000 at ≤2%
    const plan = planTrade([ladder({ pool_id: "a", points: p }), ladder({ pool_id: "b", points: p })], "STX", 8000, 0.02);
    expect(plan.verdict).toBe("split");
    expect(plan.split?.legs.length ?? 0).toBeGreaterThan(1);
    expect(plan.split?.unfilled ?? 1).toBeLessThan(1e-6);
  });
  it("partial: not enough capacity", () => {
    const plan = planTrade([ladder({ pool_id: "a", points: pts([[100, 0], [3000, 0.02], [4000, 0.3]]) })], "STX", 50000, 0.02);
    expect(plan.verdict).toBe("partial");
    expect(plan.split?.unfilled ?? 0).toBeGreaterThan(0);
  });
  it("no-fill: unknown asset or size <= 0", () => {
    expect(planTrade([ladder({ points: pts([[100, 0]]) })], "NOPE", 1000, 0.02).verdict).toBe("no-fill");
    expect(planTrade([ladder({ points: pts([[100, 0]]) })], "STX", 0, 0.02).verdict).toBe("no-fill");
  });
});

describe("viableBudgetThreshold positive case", () => {
  it("returns the smallest budget where ≥3 assets clear the bar; null below it", () => {
    const thresholds = { min_asset_depth_2pct_usd: 10000, min_independent_assets: 3 };
    const mk = (asset: string): DepthLadder => ladder({ major_symbol: asset, pool_id: asset, points: pts([[100, 0], [12000, 0.04]]) });
    const ls = [mk("A"), mk("B"), mk("C")];
    const t = viableBudgetThreshold(ls, thresholds, 0.1, 0.0025);
    expect(t).not.toBeNull();
    expect(t as number).toBeGreaterThan(0);
    expect(viableBudgetThreshold(ls, thresholds, (t as number) - 0.0025, 0.0025)).toBeNull();
  });
});

describe("realizedForNotional feasibility", () => {
  it("flags infeasible when the size exceeds the asset's deepest measured rung", () => {
    const rows = realizedForNotional([ladder({ major_symbol: "STX", points: pts([[100, 0], [1000, 0.05]]) })], 5000);
    expect(rows.find((r) => r.asset === "STX")?.feasible).toBe(false);
  });
});
