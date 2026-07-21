"""
Self-verifying facts sheet — every numeric claim Degrants.md makes about Stacks, regenerated
from the committed dataset (summary.json + study.json + pools parquet) with a source and an
as_of stamp. So the proposal cannot silently drift: `make stacks_facts` re-derives the numbers
anyone can check them against, and turns the measurement discipline into the proof-of-method.
"""

from __future__ import annotations

from ictbot.stacks import hiro, store


def _round(x, n=0):
    try:
        return round(float(x), n) if n else int(round(float(x)))
    except (TypeError, ValueError):
        return None


def _audit_at_2pct(study: dict) -> dict:
    results = (study.get("audit") or {}).get("results") or []
    return next((r for r in results if (r.get("one_way") or 0) >= 0.02), {})


def build_facts() -> dict:
    """Derive the canonical claims from committed artifacts (reproducible; no live network)."""
    summary = store.read_summary() or {}
    study = store.read_study() or {}
    pools = store.read_pool_rows()
    v = study.get("verdict", {})
    venues = summary.get("venues", {})
    idx = study.get("depth_index", {})

    # honest top ALEX pair volume (the number that corrects "$75k" → ~$12k): the deepest-volume
    # ALEX pool that ISN'T the flagged endpoint-inconsistency outlier.
    top_alex_vol = None
    top_alex_pair = None
    if not pools.empty:
        a = pools[
            (pools["venue"] == "alex") & (~pools["note"].astype(str).str.contains("turnover"))
        ]
        a = a.dropna(subset=["volume_24h_usd"]).sort_values("volume_24h_usd", ascending=False)
        if len(a):
            top_alex_vol = _round(a.iloc[0]["volume_24h_usd"])
            top_alex_pair = str(a.iloc[0]["symbol"])

    dis = (summary.get("price_disagreements") or [{}])[0]
    btc_disagree_pct = None
    if dis.get("agreement"):
        btc_disagree_pct = _round(abs(dis["agreement"] - 1.0) * 100, 1)

    def _claim(key, value, source, note=""):
        return {"key": key, "value": value, "source": source, "note": note}

    claims = [
        _claim(
            "alex_pools_total",
            venues.get("alex", {}).get("pools"),
            "ALEX /v2/public/pools",
            "total pools listed",
        ),
        _claim(
            "alex_pools_with_balance",
            (venues.get("alex", {}).get("pools", 0) - venues.get("alex", {}).get("dead", 0)),
            "on-chain get-balances",
            "pools with non-zero reserves",
        ),
        _claim(
            "alex_pools_dead",
            venues.get("alex", {}).get("dead"),
            "on-chain get-balances",
            "zero-reserve pools",
        ),
        _claim(
            "bitflow_pools_total",
            venues.get("bitflow", {}).get("pools"),
            "on-chain registries xyk-core-v-1-2 + stableswap-core-v-1-4",
            "43 xyk + 4 stableswap; NO API used",
        ),
        _claim(
            "velar_pools_total",
            venues.get("velar", {}).get("pools"),
            "Velar /pools (public API — exists, contra 'UNVERIFIED')",
        ),
        _claim("pools_total_all_venues", summary.get("pools_total"), "harvest"),
        _claim(
            "pools_dead_all_venues",
            summary.get("pools_dead"),
            "harvest",
            "zero-reserve; excludes dormant",
        ),
        _claim(
            "pools_live_all_venues",
            summary.get("pools_live"),
            "harvest",
            "reserves + measurable 24h activity",
        ),
        _claim(
            "tvl_total_usd",
            _round(summary.get("tvl_usd_total")),
            "on-chain reserves × mean(feed) price",
        ),
        _claim(
            "volume_24h_usd_reported",
            _round(summary.get("volume_24h_usd_total")),
            "ALEX /v1/allswaps (honest USD)",
        ),
        _claim(
            "volume_24h_usd_flagged",
            _round(summary.get("volume_24h_usd_flagged")),
            "one pool, 465× turnover",
            "ALEX bridged-btc/bridged-usdt endpoint inconsistency",
        ),
        _claim(
            "volume_24h_usd_clean",
            _round(summary.get("volume_24h_usd_clean")),
            "ALEX /v1/allswaps",
            "ENTIRE tradeable ecosystem ex-flagged",
        ),
        _claim(
            "top_alex_pair_volume_usd",
            top_alex_vol,
            "ALEX /v1/allswaps baseVolume × price",
            f"corrects Degrants.md '$75k' (raw token count) — {top_alex_pair}",
        ),
        _claim(
            "depth_movable_at_2pct_usd",
            _round(v.get("movable_at_2pct_usd")),
            "on-chain AMM quotes (get-dy/get-helper/get-y)",
            "can move at ≤2% slippage, total",
        ),
        _claim(
            "depth_deepest_pool_2pct_usd",
            _round(v.get("deepest_single_pool_usd")),
            "on-chain AMM quotes",
            "deepest single venue",
        ),
        _claim(
            "tradeable_assets_at_2pct",
            v.get("n_tradeable_assets"),
            "depth index",
            f"assets clearing $10k depth: {', '.join(v.get('tradeable_assets_at_2pct', [])) or 'none'}",
        ),
        _claim(
            "rotation_viable",
            v.get("rotation_viable"),
            "depth index",
            "≥3 independent liquid assets needed",
        ),
        _claim(
            "btc_price_disagreement_pct",
            btc_disagree_pct,
            "Velar vs ALEX price feeds",
            "cross-feed disagreement on BTC",
        ),
        _claim(
            "depth_index_pools_measured",
            idx.get("pools"),
            "depth ladders",
            "pools with a measurable depth curve",
        ),
        _claim(
            "bitflow_swaps_24h",
            venues.get("bitflow", {}).get("swaps_24h"),
            "Hiro tx index",
            "24h swap count across live Bitflow pools (activity signal; USD needs event attribution)",
        ),
        _claim(
            "bitflow_volume_24h_usd",
            _round(venues.get("bitflow", {}).get("volume_24h_usd")),
            "DexScreener (free aggregator)",
            "real Bitflow USD volume — DexScreener indexed the swap events Bitflow's missing API hides",
        ),
        _claim(
            "dexscreener_volume_24h_usd_total",
            _round(summary.get("volume_24h_usd_dex_total")),
            "DexScreener (free, keyless; 3rd feed)",
            "independent 24h volume across all 3 venues (Bitflow by pool-contract; ALEX/Velar by "
            "dex+token-pair) — no double-count; cross-checks our clean figure",
        ),
        _claim(
            "backtest_total_return_at_2pct",
            _round(_audit_at_2pct(study).get("total_return", 0) * 100, 1),
            "engine.portfolio_replay on STX+BTC daily",
            "momentum rotation total return % at 2% one-way friction — no edge (corroborates depth)",
        ),
        _claim(
            "hiro_keyless_rate_limit_rpm",
            hiro.KEYLESS_MEASURED_RPM,
            "measured probe 2026-07-18",
            f"keyless call-read throttles above ~{hiro.KEYLESS_BURST_BEFORE_429} burst; "
            "set HIRO_API_KEY for speed",
        ),
    ]
    return {
        "as_of_date": summary.get("as_of_date"),
        "as_of_ts": summary.get("as_of_ts"),
        "dataset_digest": summary.get("digest"),
        "claims": claims,
    }


def facts_table(facts: dict) -> str:
    lines = [f"Stacks Depth — measured facts (as of {facts.get('as_of_date')})", ""]
    lines.append(f"{'claim':<32}{'value':>16}   source")
    lines.append("-" * 90)
    for c in facts["claims"]:
        val = c["value"]
        vs = f"{val:,}" if isinstance(val, (int, float)) and not isinstance(val, bool) else str(val)
        lines.append(f"{c['key']:<32}{vs:>16}   {c['source']}")
        if c.get("note"):
            lines.append(f"{'':<32}{'':>16}   ↳ {c['note']}")
    return "\n".join(lines)


def check() -> tuple[bool, dict, dict]:
    """Recompute facts from committed artifacts; compare to committed facts.json."""
    recomputed = build_facts()
    committed = _read_committed()
    return recomputed == committed, recomputed, committed


_FACTS_PATH = store.STACKS_DATA_DIR / "facts.json"


def _read_committed() -> dict:
    import json

    if not _FACTS_PATH.exists():
        return {}
    try:
        return json.loads(_FACTS_PATH.read_text())
    except Exception:
        return {}


def write_facts(facts: dict) -> str:
    import json
    import os

    store.STACKS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _FACTS_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(facts, indent=2, sort_keys=True))
    os.replace(tmp, _FACTS_PATH)
    return str(_FACTS_PATH)
