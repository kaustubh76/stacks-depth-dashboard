import { describe, it, expect } from "vitest";

import studyJson from "../data/study.json";
import laddersJson from "../data/depth_ladders.json";
import type { DepthLadder, Study } from "../api/types";
import {
  poolKey,
  slippageAt,
  slippageTrace,
  maxNotionalAt,
  movableAtSlippage,
  byAssetAtSlippage,
  thresholdStats,
  realizedForNotional,
  planTrade,
  recomputeVerdict,
  viableBudgetThreshold,
} from "./depth";

// The committed snapshot is the single source of truth. These tests assert that the client-side
// TS compute core reproduces the SAME figures the Python harvest published into study.json — so the
// suite doubles as a CI reproducibility gate that survives every 6-hourly re-harvest (the numbers
// are read from the JSON, never hardcoded). Tolerance is <$1 because the Python side double-rounds
// aggregate totals to 2dp while the TS side rounds only per-pool (documented in depth.ts:5-9).
const study = studyJson as unknown as Study;
const ladders = laddersJson as unknown as DepthLadder[];
const TOL = 1;
const BUCKETS = ["0.005", "0.010", "0.020", "0.050"] as const;

describe("depth.ts reproduces the committed study.json (reproducibility contract)", () => {
  it("has the expected ladder granularity (one row per pool-side)", () => {
    // 56 (pool_id, major_symbol) rows — bitflow stableswaps appear once per major side; do NOT dedupe.
    expect(ladders.length).toBe(study.depth_index.by_threshold["0.020"].pools_with_any_depth);
  });

  it("movableAtSlippage matches by_threshold.total_movable_usd at every measured bucket (<$1)", () => {
    for (const k of BUCKETS) {
      const got = movableAtSlippage(ladders, Number(k));
      expect(Math.abs(got - study.depth_index.by_threshold[k].total_movable_usd)).toBeLessThan(TOL);
    }
  });

  it("byAssetAtSlippage matches by_asset at every measured bucket (<$1)", () => {
    const expected = study.depth_index.by_asset;
    for (const k of BUCKETS) {
      const got = byAssetAtSlippage(ladders, Number(k));
      for (const asset of Object.keys(expected)) {
        expect(Math.abs((got[asset] ?? 0) - (expected[asset][k] ?? 0))).toBeLessThan(TOL);
      }
    }
  });

  it("thresholdStats reproduces the deepest pool + coverage at ≤2% (incl. the pool_id fix)", () => {
    const bt = study.depth_index.by_threshold["0.020"];
    const s = thresholdStats(ladders, 0.02);
    expect(Math.abs(s.deepestUsd - bt.deepest_pool_usd)).toBeLessThan(TOL);
    expect(s.deepestPool).toBe(bt.deepest_pool); // regression guard for the double-prefix bug
    expect(s.poolsWithDepth).toBe(bt.pools_with_any_depth);
  });

  it("maxNotionalAt on the deepest ladder reproduces its depth_2pct_usd", () => {
    const deepest = [...ladders].sort((a, b) => b.depth_2pct_usd - a.depth_2pct_usd)[0];
    expect(Math.abs(maxNotionalAt(deepest.points, 0.02) - deepest.depth_2pct_usd)).toBeLessThan(TOL);
  });

  it("recomputeVerdict at ≤2% reproduces the published verdict", () => {
    const v = study.verdict;
    const rv = recomputeVerdict(ladders, 0.02, v.thresholds);
    expect(Math.abs(rv.movable - v.movable_at_2pct_usd)).toBeLessThan(TOL);
    expect(rv.nTradeable).toBe(v.n_tradeable_assets);
    expect([...rv.tradeable].sort()).toEqual([...v.tradeable_assets_at_2pct].sort());
    expect(rv.rotationViable).toBe(v.rotation_viable);
  });

  it("viableBudgetThreshold is null — no budget ≤10% makes rotation viable (the honest finding)", () => {
    // Guard the v13 "structurally too thin at any realistic budget" claim against future harvests.
    expect(viableBudgetThreshold(ladders, study.verdict.thresholds)).toBeNull();
  });
});

describe("depth.ts pure-function invariants", () => {
  const sample = ladders[0];

  it("poolKey is unique across all ladders", () => {
    expect(new Set(ladders.map(poolKey)).size).toBe(ladders.length);
  });

  it("slippageTrace.slippage equals slippageAt for interior + boundary sizes", () => {
    for (const n of [50, 100, 500, 5000, 50000, 1_000_000]) {
      expect(slippageTrace(sample.points, n).slippage).toBeCloseTo(slippageAt(sample.points, n), 10);
    }
  });

  it("slippageTrace mode reflects position relative to the measured rungs", () => {
    const pts = sample.points;
    expect(slippageTrace(pts, pts[0].notional - 1).mode).toBe("below-first");
    expect(slippageTrace(pts, pts[pts.length - 1].notional + 1).mode).toBe("above-last");
    expect(slippageTrace(pts, (pts[0].notional + pts[1].notional) / 2).mode).toBe("interp");
  });

  it("slippageAt clamps below the first rung and above the last", () => {
    const pts = sample.points;
    expect(slippageAt(pts, pts[0].notional - 1)).toBe(pts[0].slippage);
    expect(slippageAt(pts, pts[pts.length - 1].notional + 1)).toBe(pts[pts.length - 1].slippage);
  });

  it("planTrade fills a tiny STX trade in one pool and cannot fully fill an absurd one", () => {
    const tiny = planTrade(ladders, "STX", 100, 0.02);
    expect(tiny.verdict).toBe("single");
    expect(tiny.best?.withinBudget).toBe(true);
    const absurd = planTrade(ladders, "STX", 100_000_000, 0.001);
    expect(["partial", "no-fill"]).toContain(absurd.verdict);
  });

  it("realizedForNotional returns rows sorted by ascending slippage", () => {
    const slips = realizedForNotional(ladders, 10000).map((r) => r.slippage);
    expect([...slips].sort((a, b) => a - b)).toEqual(slips);
  });
});
