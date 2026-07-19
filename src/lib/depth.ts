// Pure compute over the per-pool slippage ladders. This is what makes the dashboard a
// TOOL rather than a static report: the budget slider, the "move $X" calculator, and the
// live-recomputed verdict all derive from these functions over the committed ladders.
//
// Correctness contract (verified in scripts against study.json): at the four measured
// buckets 0.5/1/2/5%, `movableAtSlippage` reproduces study.depth_index.by_threshold.*
// .total_movable_usd and `byAssetAtSlippage` reproduces study.depth_index.by_asset. Between
// buckets it linearly interpolates each pool's ladder — the same interpolation the study uses
// (its deepest-pool figures land off the discrete grid, e.g. $51,397 at ≤2%).

import type { DepthLadder, SlippagePoint } from "../api/types";

/**
 * Canonical ladder identity. `venue:pool_id` alone is NOT unique — the bitflow stableswap
 * pools appear once per major side — so every selection surface (explorer focus, browser
 * rows, compare tray) must key on the full triple.
 */
export const poolKey = (l: DepthLadder): string => `${l.venue}:${l.pool_id}:${l.major_symbol}`;

/** Linear-interpolate the slippage a single pool charges at an arbitrary trade size. */
export function slippageAt(points: SlippagePoint[], notional: number): number {
  if (points.length === 0) return 1;
  if (notional <= points[0].notional) return points[0].slippage;
  const last = points[points.length - 1];
  if (notional >= last.notional) return last.slippage;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (notional >= a.notional && notional <= b.notional) {
      const t = (notional - a.notional) / (b.notional - a.notional);
      return a.slippage + t * (b.slippage - a.slippage);
    }
  }
  return last.slippage;
}

/**
 * Largest trade size a single pool (one `major_symbol` side) absorbs at ≤ budget.
 * Byte-for-byte port of `max_notional_at` in src/ictbot/stacks/depth.py: take the deepest
 * measured rung that still passes, then linearly interpolate into the first failing rung
 * above it. Robust to non-monotonic ladders (never walks off a stray rung).
 */
export function maxNotionalAt(points: SlippagePoint[], budget: number): number {
  if (points.length === 0) return 0;
  const d = [...points].sort((a, b) => a.notional - b.notional);
  const ok = d.filter((p) => p.slippage <= budget);
  if (ok.length === 0) return 0;
  const best = Math.max(...ok.map((p) => p.notional));
  const above = d.filter((p) => p.notional > best);
  if (above.length === 0) return best; // never exceeded the budget within the ladder
  const nxt = above[0];
  const lastOk = ok[ok.length - 1]; // sorted → last passing rung, at `best`
  const s0 = lastOk.slippage;
  const s1 = nxt.slippage;
  const n0 = lastOk.notional;
  const n1 = nxt.notional;
  if (s1 <= s0) return best;
  // Round to 2dp per pool exactly as depth.py does before the totals are summed.
  return Math.round((n0 + (n1 - n0) * (budget - s0) / (s1 - s0)) * 100) / 100;
}

/** Total capital the whole ecosystem absorbs at ≤ budget (Σ over pools). */
export function movableAtSlippage(ladders: DepthLadder[], budget: number): number {
  return ladders.reduce((sum, l) => sum + maxNotionalAt(l.points, budget), 0);
}

/** Movable capital at ≤ budget, grouped by major asset (Σ over that asset's pools). */
export function byAssetAtSlippage(ladders: DepthLadder[], budget: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of ladders) {
    out[l.major_symbol] = (out[l.major_symbol] ?? 0) + maxNotionalAt(l.points, budget);
  }
  return out;
}

/** The deepest single pool at ≤ budget, and how many pools carry any depth. */
export function thresholdStats(ladders: DepthLadder[], budget: number): {
  total: number;
  deepestUsd: number;
  deepestPool: string | null;
  poolsWithDepth: number;
} {
  let total = 0;
  let deepestUsd = 0;
  let deepestPool: string | null = null;
  let poolsWithDepth = 0;
  for (const l of ladders) {
    const n = maxNotionalAt(l.points, budget);
    total += n;
    if (n > 0) poolsWithDepth += 1;
    if (n > deepestUsd) {
      deepestUsd = n;
      deepestPool = `${l.venue}:${l.pool_id}`;
    }
  }
  return { total, deepestUsd, deepestPool, poolsWithDepth };
}

export interface AssetRealized {
  asset: string;
  bestPool: string; // venue:pool_id of the deepest pool for this asset
  bestPoolSymbol: string;
  slippage: number; // slippage charged to move `notional` through the best pool
  feasible: boolean; // true if at least one pool can quote this size
}

/**
 * For a target trade size, the slippage you'd pay per asset routing through its best
 * (lowest-slippage) pool — the honest answer to "if I want to move $X, what does it cost?".
 */
export function realizedForNotional(ladders: DepthLadder[], notional: number): AssetRealized[] {
  const byAsset = new Map<string, DepthLadder[]>();
  for (const l of ladders) {
    const arr = byAsset.get(l.major_symbol) ?? [];
    arr.push(l);
    byAsset.set(l.major_symbol, arr);
  }
  const rows: AssetRealized[] = [];
  for (const [asset, pools] of byAsset) {
    let best: { slip: number; pool: DepthLadder } | null = null;
    for (const p of pools) {
      const slip = slippageAt(p.points, notional);
      if (best === null || slip < best.slip) best = { slip, pool: p };
    }
    if (best) {
      rows.push({
        asset,
        bestPool: `${best.pool.venue}:${best.pool.pool_id}`,
        bestPoolSymbol: best.pool.symbol,
        slippage: best.slip,
        feasible: notional <= best.pool.points[best.pool.points.length - 1].notional,
      });
    }
  }
  return rows.sort((a, b) => a.slippage - b.slippage);
}

export interface TradeLeg {
  key: string; // poolKey
  venue: string;
  symbol: string;
  notional: number;
  slippage: number; // slippage on this leg's notional through this pool
}

export interface TradePlan {
  asset: string;
  size: number;
  budget: number;
  /** Lowest-slippage single pool at `size` (null when the asset has no pools). */
  best: { leg: TradeLeg; feasible: boolean; withinBudget: boolean } | null;
  /** Greedy split across pools at ≤ budget — only computed when one pool can't do it. */
  split: { legs: TradeLeg[]; filled: number; unfilled: number; avgSlippage: number } | null;
  verdict: "single" | "split" | "partial" | "no-fill";
}

/**
 * Route a trade: the best single pool for `size`, and — when that pool alone can't clear
 * the slippage budget — a greedy split (deepest-at-budget pools first) showing how far the
 * ecosystem can actually absorb it. Pure function over the frozen ladders.
 */
export function planTrade(ladders: DepthLadder[], asset: string, size: number, budget: number): TradePlan {
  const pools = ladders.filter((l) => l.major_symbol === asset);
  const base: TradePlan = { asset, size, budget, best: null, split: null, verdict: "no-fill" };
  if (pools.length === 0 || size <= 0) return base;

  let bestPool: DepthLadder | null = null;
  let bestSlip = Infinity;
  for (const p of pools) {
    const slip = slippageAt(p.points, size);
    if (slip < bestSlip) {
      bestSlip = slip;
      bestPool = p;
    }
  }
  if (!bestPool) return base;
  const feasible = size <= bestPool.points[bestPool.points.length - 1].notional;
  const withinBudget = feasible && bestSlip <= budget;
  base.best = {
    leg: { key: poolKey(bestPool), venue: bestPool.venue, symbol: bestPool.symbol, notional: size, slippage: bestSlip },
    feasible,
    withinBudget,
  };
  if (withinBudget) {
    base.verdict = "single";
    return base;
  }

  // Greedy split: fill from the pools that absorb the most at ≤ budget.
  const ranked = pools
    .map((p) => ({ p, cap: maxNotionalAt(p.points, budget) }))
    .filter((r) => r.cap > 0)
    .sort((a, b) => b.cap - a.cap);
  const legs: TradeLeg[] = [];
  let remaining = size;
  for (const { p, cap } of ranked) {
    if (remaining <= 0) break;
    const notional = Math.min(remaining, cap);
    legs.push({ key: poolKey(p), venue: p.venue, symbol: p.symbol, notional, slippage: slippageAt(p.points, notional) });
    remaining -= notional;
  }
  const filled = size - remaining;
  if (filled <= 0) return base; // verdict stays no-fill
  const avgSlippage = legs.reduce((s, l) => s + l.slippage * l.notional, 0) / filled;
  base.split = { legs, filled, unfilled: remaining, avgSlippage };
  base.verdict = remaining <= 1e-9 ? "split" : "partial";
  return base;
}

export interface RecomputedVerdict {
  budget: number;
  movable: number;
  deepestUsd: number;
  tradeable: string[]; // assets clearing minAssetDepth at this budget
  nTradeable: number;
  rotationViable: boolean;
}

/** Recompute the verdict at an arbitrary slippage budget, reusing the study's thresholds. */
export function recomputeVerdict(
  ladders: DepthLadder[],
  budget: number,
  thresholds: { min_asset_depth_2pct_usd: number; min_independent_assets: number },
): RecomputedVerdict {
  const stats = thresholdStats(ladders, budget);
  const byAsset = byAssetAtSlippage(ladders, budget);
  const tradeable = Object.entries(byAsset)
    .filter(([, v]) => v >= thresholds.min_asset_depth_2pct_usd)
    .map(([k]) => k)
    .sort((a, b) => (byAsset[b] ?? 0) - (byAsset[a] ?? 0));
  return {
    budget,
    movable: stats.total,
    deepestUsd: stats.deepestUsd,
    tradeable,
    nTradeable: tradeable.length,
    rotationViable: tradeable.length >= thresholds.min_independent_assets,
  };
}
