import { describe, it, expect } from "vitest";

import { tokenSetFromSymbol, snapshotPools, matchDrift } from "./live";
import type { LivePair, SnapshotPool } from "./live";
import type { DepthLadder, Study } from "../api/types";
import laddersJson from "../data/depth_ladders.json";
import studyJson from "../data/study.json";

const ladders = laddersJson as unknown as DepthLadder[];
const study = studyJson as unknown as Study;

describe("live.ts tokenSetFromSymbol", () => {
  it("normalizes case, strips leading $, splits on -/ , dedupes, drops empties", () => {
    expect([...tokenSetFromSymbol("sBTC-STX")].sort()).toEqual(["SBTC", "STX"]);
    expect([...tokenSetFromSymbol("$aeUSDC/STX")].sort()).toEqual(["AEUSDC", "STX"]);
    expect([...tokenSetFromSymbol("STX-STX")]).toEqual(["STX"]);
    expect([...tokenSetFromSymbol("STX-")]).toEqual(["STX"]);
  });
});

describe("live.ts snapshotPools", () => {
  it("de-dupes ladders by pool_id → study.depth_index.pools (< raw ladder count)", () => {
    const pools = snapshotPools(ladders);
    expect(pools.length).toBe(study.depth_index.pools);
    expect(pools.length).toBeLessThan(ladders.length);
  });

  it("keeps the FIRST occurrence per pool_id", () => {
    const l = (symbol: string, tvl: number): DepthLadder => ({
      venue: "v", pool_id: "p1", symbol, major_symbol: "STX", tvl_usd: tvl, depth_2pct_usd: 0, points: [],
    });
    const pools = snapshotPools([l("FIRST", 100), l("SECOND", 200)]);
    expect(pools.length).toBe(1);
    expect(pools[0].symbol).toBe("FIRST");
    expect(pools[0].tvlUsd).toBe(100);
  });
});

const sp = (over: Partial<SnapshotPool> = {}): SnapshotPool => ({
  key: "k", venue: "alex", pool_id: "p", symbol: "sBTC-STX", tvlUsd: 100, depth2pct: 50, ...over,
});
const lp = (over: Partial<LivePair> = {}): LivePair => ({
  venue: "alex", base: "sBTC", quote: "STX", liqUsd: 150, vol24: null, priceUsd: null, url: null, ...over,
});

describe("live.ts matchDrift", () => {
  it("driftPct = (live−snapshot)/snapshot × 100, plus liveMovableEst = movable × ratio", () => {
    const d = matchDrift([sp({ tvlUsd: 100 })], [lp({ liqUsd: 150 })], 1000);
    expect(d.matched).toBe(1);
    expect(d.rows[0].driftPct).toBeCloseTo(50, 6);
    expect(d.liveLiqTotal).toBe(150);
    expect(d.snapshotTvlTotal).toBe(100);
    expect(d.liveMovableEst).toBeCloseTo(1500, 6);
  });

  it("closest-TVL dedup: matches the nearest-TVL pool, not a tiny duplicate (no invented huge drift)", () => {
    const pools = [sp({ pool_id: "small", tvlUsd: 100 }), sp({ pool_id: "big", tvlUsd: 10000 })];
    const d = matchDrift(pools, [lp({ liqUsd: 9000 })], 0);
    expect(d.matched).toBe(1);
    expect(d.rows[0].pool.pool_id).toBe("big");
    expect(d.rows[0].driftPct).toBeCloseTo(-10, 6);
  });

  it("does not match across venues", () => {
    const d = matchDrift([sp({ venue: "alex" })], [lp({ venue: "velar" })], 1000);
    expect(d.matched).toBe(0);
    expect(d.driftPct).toBeNull();
    expect(d.liveMovableEst).toBeNull();
  });

  it("matches with base/quote reversed (token-set is order-independent)", () => {
    const d = matchDrift([sp({ symbol: "sBTC-STX" })], [lp({ base: "STX", quote: "sBTC" })], 1000);
    expect(d.matched).toBe(1);
  });

  it("skips null liqUsd and handles empty inputs", () => {
    expect(matchDrift([sp()], [lp({ liqUsd: null })], 1000).matched).toBe(0);
    const e = matchDrift([], [], 1000);
    expect(e.matched).toBe(0);
    expect(e.driftPct).toBeNull();
    expect(e.liveMovableEst).toBeNull();
  });
});
