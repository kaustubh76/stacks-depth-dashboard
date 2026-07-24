// Typed contract for the Stacks Depth instrument. Mirrors the JSON that
// `/api/stacks/dashboard` returns (src/ictbot/stacks/webapp.py) and that is
// baked into src/data/*.json from the committed on-chain snapshot (see summary.as_of_date).

export interface FlaggedPool {
  pool_id: string;
  symbol: string;
  volume_24h_usd: number;
  note: string;
}

export interface PriceDisagreement {
  symbol: string;
  contract: string;
  alex: number | null;
  velar: number | null;
  chosen: number;
  spread: number; // fractional (0.0749 = 7.49%)
  agreement: number; // 0..1
}

export interface Venue {
  pools: number;
  live: number;
  dead: number;
  dormant: number;
  error: number;
  tvl_usd: number;
  volume_24h_usd: number;
  volume_24h_usd_dex: number;
  swaps_24h: number;
  api_disagreements: number;
}

export type VenueName = "alex" | "bitflow" | "velar";

export interface HiroStats {
  requests: number;
  errors: number;
  retries: number;
  rate_stalls: number;
  rate_wait_total_s: number;
  last_status: number | null;
}

export interface Summary {
  as_of_date: string;
  as_of_ts: number;
  digest: string;
  elapsed_s: number;
  pools_total: number;
  pools_live: number;
  pools_dead: number;
  dead_fraction: number;
  tvl_usd_total: number;
  volume_24h_usd_total: number;
  volume_24h_usd_clean: number;
  volume_24h_usd_flagged: number;
  volume_24h_usd_dex_total: number;
  venues: Record<VenueName, Venue>;
  flagged_pools: FlaggedPool[];
  price_disagreements: PriceDisagreement[];
  hiro_stats: HiroStats;
}

// depth_index.by_asset[asset] → { "0.005": usd, "0.010": usd, "0.020": usd, "0.050": usd }
export type AssetDepth = Record<string, number>;

export interface ThresholdBucket {
  total_movable_usd: number;
  deepest_pool: string;
  deepest_pool_usd: number;
  pools_with_any_depth: number;
}

export interface DepthIndex {
  by_asset: Record<string, AssetDepth>;
  by_threshold: Record<string, ThresholdBucket>;
  pools: number;
}

export interface Verdict {
  can_deploy_50k_at_2pct: boolean;
  movable_at_2pct_usd: number;
  deepest_single_pool_usd: number;
  n_tradeable_assets: number;
  tradeable_assets_at_2pct: string[];
  rotation_viable: boolean;
  thresholds: {
    deploy_target_usd: number;
    min_asset_depth_2pct_usd: number;
    min_independent_assets: number;
  };
  finding: string;
}

export interface AuditResult {
  one_way: number; // friction fraction
  total_return: number; // fractional
  max_dd: number; // fractional
  median_weekly_ret: number;
  pct_windows_up: number; // 0..1
  n_windows: number;
}

export interface Audit {
  finding: string;
  friction_flip_one_way: number;
  n_assets: number;
  n_bars: number;
  tokens: string[];
  results: AuditResult[];
}

export interface MarketStructure {
  pools_total: number;
  pools_live: number;
  pools_dead: number;
  dead_fraction: number;
  tvl_usd_total: number;
  volume_24h_usd_total: number;
  volume_24h_usd_clean: number;
  volume_24h_usd_flagged: number;
  venues: Record<VenueName, Venue>;
  flagged_pools: FlaggedPool[];
}

export interface Study {
  as_of_date: string;
  as_of_ts: number;
  market_structure: MarketStructure;
  depth_index: DepthIndex;
  verdict: Verdict;
  audit: Audit;
}

export interface Claim {
  key: string;
  value: number | string | boolean;
  source: string;
  note: string;
}

export interface Facts {
  as_of_date: string;
  as_of_ts: number;
  dataset_digest: string;
  claims: Claim[];
}

export interface SlippagePoint {
  notional: number;
  slippage: number; // fractional
}

export interface DepthLadder {
  venue: string;
  pool_id: string;
  symbol: string;
  major_symbol: string;
  tvl_usd: number;
  depth_2pct_usd: number;
  points: SlippagePoint[];
}

/** One point in the depth-over-time series — one per harvest date (the day's latest harvest wins). */
export interface HistoryPoint {
  as_of_date: string;
  as_of_ts: number;
  movable_at_2pct_usd: number;
  deepest_single_pool_usd: number;
  n_tradeable_assets: number;
  rotation_viable: boolean;
  tvl_usd_total: number;
  volume_24h_usd_clean: number;
  pools_live: number;
  pools_total: number;
}

// The one-round-trip envelope from /api/stacks/dashboard.
export interface Dashboard {
  summary: Summary;
  study: Study;
  facts: Facts;
  history?: HistoryPoint[];
}

// The full baked payload the UI renders (dashboard + the derived per-pool ladders + the trend).
export interface StacksData extends Dashboard {
  ladders: DepthLadder[];
  live: boolean; // true only if a live /api/stacks/dashboard answered
  history: HistoryPoint[];
}
