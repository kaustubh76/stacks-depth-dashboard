// Match the committed snapshot pools to LIVE DexScreener pairs and compute liquidity drift.
// Pure + unit-checkable. This is what makes the depth measurement itself "move": the snapshot
// numbers stay frozen (rigorous AMM quotes), and this layer shows how far live pool liquidity
// has drifted since the snapshot date. Live never overwrites a snapshot number.

import type { DepthLadder } from "../api/types";
import { poolKey } from "./depth";

export interface LivePair {
  venue: string; // DexScreener dexId (bitflow | velar | alex) — matches the snapshot venue
  base: string;
  quote: string;
  liqUsd: number | null;
  vol24: number | null;
  priceUsd: number | null;
  url: string | null;
}

export interface SnapshotPool {
  key: string; // poolKey(l) — venue:pool_id:major_symbol, for deep-linking the pool page
  venue: string;
  pool_id: string;
  symbol: string;
  tvlUsd: number;
  depth2pct: number;
}

export interface PoolDrift {
  pool: SnapshotPool;
  liveLiq: number;
  driftPct: number; // (live − snapshot) / snapshot × 100
  vol24: number | null;
  url: string | null;
}

export interface DriftSummary {
  rows: PoolDrift[];
  liveLiqTotal: number;
  snapshotTvlTotal: number; // over matched pools only (apples-to-apples)
  driftPct: number | null;
  matched: number;
  liveMovableEst: number | null; // snapshot movable × live/snapshot liquidity ratio (an ESTIMATE)
}

const normTok = (s: string) => s.replace(/^\$/, "").trim().toUpperCase();

/** Normalized token set from a snapshot symbol ("sBTC-STX") or a base/quote pair. */
export function tokenSetFromSymbol(sym: string): Set<string> {
  return new Set(sym.split(/[-/]/).map(normTok).filter(Boolean));
}

const setKey = (venue: string, toks: Iterable<string>) =>
  venue.toLowerCase() + "|" + [...toks].sort().join(",");

/** Dedupe ladders (keyed by pool_id + major_symbol) down to one row per pool. */
export function snapshotPools(ladders: DepthLadder[]): SnapshotPool[] {
  const byId = new Map<string, SnapshotPool>();
  for (const l of ladders) {
    if (!byId.has(l.pool_id)) {
      byId.set(l.pool_id, {
        key: poolKey(l),
        venue: l.venue,
        pool_id: l.pool_id,
        symbol: l.symbol,
        tvlUsd: l.tvl_usd,
        depth2pct: l.depth_2pct_usd,
      });
    }
  }
  return [...byId.values()];
}

/** Match snapshot pools ↔ live pairs by (venue + token-set); compute per-pool + ecosystem drift. */
export function matchDrift(pools: SnapshotPool[], pairs: LivePair[], snapshotMovable: number): DriftSummary {
  // Index live pairs by venue+token-set (one per key).
  const liveIdx = new Map<string, LivePair>();
  for (const p of pairs) {
    if (p.liqUsd == null) continue;
    const k = setKey(p.venue, [normTok(p.base), normTok(p.quote)]);
    if (!liveIdx.has(k)) liveIdx.set(k, p);
  }
  // Group snapshot pools by the same key (a token pair can have >1 pool at a venue).
  const groups = new Map<string, SnapshotPool[]>();
  for (const pool of pools) {
    const k = setKey(pool.venue, tokenSetFromSymbol(pool.symbol));
    const g = groups.get(k);
    if (g) g.push(pool);
    else groups.set(k, [pool]);
  }
  // Match each live pair to the ONE snapshot pool closest in TVL (avoids a tiny duplicate pool
  // matching the same pair and inventing a huge drift).
  const rows: PoolDrift[] = [];
  for (const [k, lp] of liveIdx) {
    const grp = groups.get(k);
    if (!grp || lp.liqUsd == null) continue;
    const pool = grp.reduce((best, p) =>
      Math.abs(p.tvlUsd - lp.liqUsd!) < Math.abs(best.tvlUsd - lp.liqUsd!) ? p : best,
    );
    const driftPct = pool.tvlUsd > 0 ? ((lp.liqUsd - pool.tvlUsd) / pool.tvlUsd) * 100 : 0;
    rows.push({ pool, liveLiq: lp.liqUsd, driftPct, vol24: lp.vol24, url: lp.url });
  }
  rows.sort((a, b) => b.pool.depth2pct - a.pool.depth2pct || b.liveLiq - a.liveLiq);
  const liveLiqTotal = rows.reduce((s, r) => s + r.liveLiq, 0);
  const snapshotTvlTotal = rows.reduce((s, r) => s + r.pool.tvlUsd, 0);
  const driftPct = snapshotTvlTotal > 0 ? ((liveLiqTotal - snapshotTvlTotal) / snapshotTvlTotal) * 100 : null;
  const ratio = snapshotTvlTotal > 0 ? liveLiqTotal / snapshotTvlTotal : null;
  return {
    rows,
    liveLiqTotal,
    snapshotTvlTotal,
    driftPct,
    matched: rows.length,
    liveMovableEst: ratio != null ? snapshotMovable * ratio : null,
  };
}
