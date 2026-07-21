"""
The Stacks Depth study (M2) — derives the published market-structure + depth-index report
**deterministically from the committed parquet**, so `make stacks_study` regenerates every
number bit-for-bit. No wall-clock: `as_of` comes from the data itself.

The verdict is framed as a **depth gauge, not a one-shot alpha verdict** (Degrants.md §3): it
measures *whether and when* Stacks depth can support automated strategies and publishes the
threshold, rather than asking the dead-end question "is there alpha on Stacks?".
"""

from __future__ import annotations

import pandas as pd

from ictbot.stacks import depth, store

# A cross-sectional momentum rotation needs several *independent* liquid assets and enough
# depth to rebalance into each without paying it all back in slippage. These are the
# thresholds we publish; the study reports the measured values against them.
MIN_ASSET_DEPTH_2PCT = 10_000.0  # an asset must absorb ≥$10k at ≤2% to be a rotation candidate
MIN_INDEPENDENT_ASSETS = 3  # fewer than this and "rotation" is a single bet, not a strategy
DEPLOY_TARGET = 50_000.0  # the "$50k to work" question


def compute_study(
    pools_df: pd.DataFrame, depth_df: pd.DataFrame, prices_df: pd.DataFrame | None = None
) -> dict:
    """Pure, deterministic. Same committed parquet in → identical study out."""
    if pools_df.empty:
        return {
            "as_of_date": "",
            "as_of_ts": 0,
            "market_structure": {},
            "depth_index": {},
            "verdict": {},
        }
    as_of_ts = int(pd.to_numeric(pools_df["as_of_ts"]).max())
    as_of_date = str(sorted(pools_df["as_of_date"].unique())[-1])

    ms_full = store.summarize(pools_df, as_of_ts=as_of_ts, as_of_date=as_of_date)
    # keep only the deterministic, publishable subset (drop nothing here — summarize is pure)
    market_structure = {
        k: ms_full[k]
        for k in (
            "pools_total",
            "pools_dead",
            "pools_live",
            "dead_fraction",
            "tvl_usd_total",
            "volume_24h_usd_total",
            "volume_24h_usd_flagged",
            "volume_24h_usd_clean",
            "flagged_pools",
            "venues",
        )
    }
    index = depth.compute_index(depth_df)
    verdict = _verdict(index)
    from ictbot.stacks import backtest

    audit = (
        backtest.compute_audit(prices_df) if prices_df is not None and not prices_df.empty else {}
    )
    return {
        "audit": audit,
        "as_of_date": as_of_date,
        "as_of_ts": as_of_ts,
        "market_structure": market_structure,
        "depth_index": index,
        "verdict": verdict,
    }


def _verdict(index: dict) -> dict:
    """The depth-gauge finding: measure whether conditions support automated strategies."""
    at2 = index.get("by_threshold", {}).get("0.020", {})
    total_2pct = at2.get("total_movable_usd", 0.0)
    deepest = at2.get("deepest_pool_usd", 0.0)
    by_asset = index.get("by_asset", {})
    tradeable = sorted(
        (sym for sym, d in by_asset.items() if d.get("0.020", 0.0) >= MIN_ASSET_DEPTH_2PCT),
        key=lambda s: -by_asset[s]["0.020"],
    )
    rotation_viable = len(tradeable) >= MIN_INDEPENDENT_ASSETS
    return {
        "movable_at_2pct_usd": round(total_2pct, 2),
        "deepest_single_pool_usd": round(deepest, 2),
        "can_deploy_50k_at_2pct": total_2pct >= DEPLOY_TARGET,
        "tradeable_assets_at_2pct": tradeable,
        "n_tradeable_assets": len(tradeable),
        "rotation_viable": rotation_viable,
        "thresholds": {
            "min_asset_depth_2pct_usd": MIN_ASSET_DEPTH_2PCT,
            "min_independent_assets": MIN_INDEPENDENT_ASSETS,
            "deploy_target_usd": DEPLOY_TARGET,
        },
        "finding": _finding_text(total_2pct, deepest, tradeable, rotation_viable),
    }


def _finding_text(total_2pct, deepest, tradeable, rotation_viable) -> str:
    assets = ", ".join(tradeable) if tradeable else "none"
    if rotation_viable:
        return (
            f"Depth gauge: ${total_2pct:,.0f} can move at ≤2% slippage across the ecosystem "
            f"({len(tradeable)} assets clear the ${MIN_ASSET_DEPTH_2PCT:,.0f} bar: {assets}). "
            f"Conditions now MEET the threshold for a systematic rotation."
        )
    return (
        f"Depth gauge: only ${total_2pct:,.0f} can move at ≤2% slippage across all of Stacks "
        f"DeFi; the deepest single pool absorbs ${deepest:,.0f}. Just {len(tradeable)} asset(s) "
        f"clear the ${MIN_ASSET_DEPTH_2PCT:,.0f} depth bar ({assets}) — below the "
        f"{MIN_INDEPENDENT_ASSETS} independent assets a cross-sectional rotation needs. "
        f"Systematic trading on Stacks is NOT currently viable; this is the measured threshold "
        f"at which that flips, published — not a one-shot verdict."
    )


def run_and_save(*, log=print, cache_ttl: float = 1800.0) -> dict:
    """Live: (re)compute depth, commit pools+depth parquet, derive the study from the committed
    files (so live and --check share a code path), write study.json. Returns the study.

    ``cache_ttl`` is long (30 min) so the vendor-API snapshot (ALEX/Velar/DexScreener prices &
    volumes) is fetched ONCE and stays coherent across the multi-minute keyless crawl — a short
    TTL let a mid-run re-fetch get rate-limited and poison the run with $0 ALEX volume."""
    from ictbot.stacks import backtest, harvest, prices

    book = prices.build_prices(cache_ttl=cache_ttl)
    # ONE enumerate+snapshot pass, shared by the dataset and the depth ladders (no double read).
    triples = harvest.collect(book, cache_ttl=cache_ttl, log=log)
    rows, summary = harvest.run_harvest(book=book, triples=triples, log=log)
    date = summary["as_of_date"]
    store.write_pool_rows(rows, date)
    store.write_summary(summary)

    depth_rows = depth.run_depth(book, pairs=triples, log=log)
    store.write_depth_df(depth.rows_to_frame(depth_rows), date)

    # the rolling-window audit's price series — committed so the audit reproduces from data
    try:
        store.write_prices_df(backtest.build_prices_frame(), date)
    except Exception as e:
        log(f"backtest prices fetch failed (audit skipped): {e}")

    # derive from the COMMITTED parquet, not in-memory, so this equals the --check path exactly
    study = compute_study(
        store.read_pool_rows(date), store.read_depth_df(date), store.read_prices_df(date)
    )
    store.write_study(study)
    return study


def check() -> tuple[bool, dict, dict]:
    """Recompute the study from committed parquet and compare to committed study.json.
    Returns (matches, recomputed, committed)."""
    recomputed = compute_study(
        store.read_pool_rows(), store.read_depth_df(), store.read_prices_df()
    )
    committed = store.read_study() or {}
    return recomputed == committed, recomputed, committed
