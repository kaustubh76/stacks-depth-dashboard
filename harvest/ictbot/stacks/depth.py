"""
The Stacks DeFi depth index — how much capital can actually move, at what slippage, on
which venue. The honest answer to Degrants.md §4's "can I put $50k to work on Stacks?"

For each pool with a priced major side and non-trivial TVL, we walk a USD-notional ladder
and ask the pool's **real quote function** for the output:
  * Bitflow ``get-dy`` and ALEX ``get-helper`` — MEASURED (real on-chain AMM math, correct
    for stableswap curves).
  * Velar — MODELLED constant-product from real reserves (its on-chain quote is fee-only).

Slippage is measured against the pool's own marginal price (reserve_out / reserve_in), so
it needs only the major side priced. ``max_notional_at(threshold)`` — the largest trade that
stays within a slippage budget — is the number that answers the $50k question, per pool and
aggregated per asset.

Two-stage for reproducibility: ``run_depth`` collects the live ladder into rows (committed to
``data/stacks/depth/<date>.parquet``); ``compute_index`` derives the published index from those
rows deterministically, so ``make stacks_study`` regenerates it bit-for-bit.
"""

from __future__ import annotations

import dataclasses
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import pandas as pd

from ictbot.stacks import prices
from ictbot.stacks.venues import alex, bitflow, velar
from ictbot.stacks.venues.base import PoolMeta, PoolRow

_VENUES = {"alex": alex, "velar": velar, "bitflow": bitflow}

# USD-notional rungs and slippage budgets. Rungs span "retail" to "can a treasury deploy".
NOTIONALS_USD = [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000]
THRESHOLDS = [0.005, 0.01, 0.02, 0.05]  # 0.5% / 1% / 2% / 5% slippage budgets
DEPTH_MAJORS = {"STX", "sBTC", "aBTC", "xBTC", "pBTC", "psBTC", "aeUSDC", "aeUSDT", "USDA", "USDh"}
MIN_TVL_USD = 1_000.0  # below this a "depth" number is noise; recorded as too-thin


@dataclass
class DepthRow:
    as_of_date: str
    as_of_ts: int
    venue: str
    pool_id: str
    symbol: str
    major_symbol: str
    major_token: str
    spot_usd: float
    tvl_usd: float
    notional_usd: float
    slippage: float  # 1 - effective_rate/marginal_rate (includes fee); 1.0 = quote reverted
    method: str  # measured | modelled


DEPTH_FIELDS = [f.name for f in dataclasses.fields(DepthRow)]


def _major_side(meta: PoolMeta, row: PoolRow, book) -> tuple[str, str, bool] | None:
    """Return (major_token, major_symbol, major_is_x) preferring STX > BTC > USD > other."""
    order = ["STX", "sBTC", "aBTC", "xBTC", "pBTC", "psBTC", "aeUSDC", "aeUSDT", "USDA", "USDh"]
    cands = []
    for tok, is_x in ((meta.token_x, True), (meta.token_y, False)):
        sym = book.symbol(tok)
        if sym in DEPTH_MAJORS and book.price(tok):
            cands.append((order.index(sym) if sym in order else 99, tok, sym, is_x))
    if not cands:
        return None
    cands.sort()
    _, tok, sym, is_x = cands[0]
    return tok, sym, is_x


def _quote_method(mod, meta: PoolMeta, amt: int, x_to_y: bool) -> tuple[int | None, str]:
    if hasattr(mod, "quote_detail"):
        return mod.quote_detail(meta, amt, x_to_y=x_to_y)
    out = mod.quote(meta, amt, x_to_y=x_to_y)
    return out, ("modelled" if meta.venue == "velar" else "measured")


def _ladder(mod, meta: PoolMeta, row: PoolRow, book, now: int) -> list[DepthRow]:
    side = _major_side(meta, row, book)
    if side is None:
        return []
    major_tok, major_sym, is_x = side
    spot = book.price(major_tok)
    dec_in = row.decimals_x if is_x else row.decimals_y
    dec_out = row.decimals_y if is_x else row.decimals_x
    if not spot or dec_in < 0 or dec_out < 0:
        return []

    # Slippage is measured against the effective rate of the SMALLEST rung — curve-agnostic
    # (correct for constant-product and stableswap alike) and fee-invariant (the fee is in
    # every rung so it cancels), unlike a reserve-ratio marginal which is wrong for stableswap.
    rungs: list[tuple[float, float | None, str]] = []
    for notional in NOTIONALS_USD:
        amt_in_whole = notional / spot
        out_base, m = _quote_method(mod, meta, int(amt_in_whole * 10**dec_in), is_x)
        eff = (out_base / 10**dec_out) / amt_in_whole if (out_base and out_base > 0) else None
        rungs.append((float(notional), eff, m))
        if eff is None:
            break  # reverted → larger sizes revert too

    ref = next((e for _, e, _ in rungs if e), None)
    if not ref or ref <= 0:
        return []  # can't even fill the smallest rung → no measurable depth
    method = next((m for _, e, m in rungs if e), "measured")
    out: list[DepthRow] = []
    for notional, eff, _m in rungs:
        slippage = 1.0 if not eff else max(0.0, 1.0 - eff / ref)
        out.append(
            DepthRow(
                as_of_date=time.strftime("%Y-%m-%d", time.gmtime(now)),
                as_of_ts=now,
                venue=meta.venue,
                pool_id=row.pool_id,
                symbol=row.symbol,
                major_symbol=major_sym,
                major_token=major_tok,
                spot_usd=spot,
                tvl_usd=row.tvl_usd or 0.0,
                notional_usd=notional,
                slippage=slippage,
                method=method,
            )
        )
    return out


def run_depth(
    book=None,
    *,
    pairs=None,
    venues=("alex", "velar", "bitflow"),
    min_tvl: float = MIN_TVL_USD,
    workers: int = 12,
    cache_ttl: float = 300.0,
    log: Callable[[str], None] = print,
) -> list[DepthRow]:
    """Ladder every qualifying pool (parallel). ``pairs`` = (mod, meta, row) triples from
    ``harvest.collect`` — pass them so the study doesn't read the chain a second time; if omitted,
    run one collect() here. Returns depth rows."""
    if book is None:
        book = prices.build_prices(cache_ttl=cache_ttl)
    now = int(time.time())
    if pairs is None:
        from ictbot.stacks import harvest

        pairs = harvest.collect(book, venues=venues, cache_ttl=cache_ttl, workers=workers, log=log)
    jobs: list[tuple] = [
        (mod, meta, row)
        for (mod, meta, row) in pairs
        if (row.tvl_usd or 0) >= min_tvl and _major_side(meta, row, book) is not None
    ]
    log(f"depth: laddering {len(jobs)} qualifying pools × up to {len(NOTIONALS_USD)} rungs")

    rows: list[DepthRow] = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for res in ex.map(lambda j: _ladder(j[0], j[1], j[2], book, now), jobs):
            rows.extend(res)
    return rows


# --------------------------------------------------------------------------- #
# Deterministic index computation (from committed depth rows)
# --------------------------------------------------------------------------- #


def max_notional_at(pool_rungs: pd.DataFrame, threshold: float) -> float:
    """Largest USD notional whose slippage ≤ threshold, linearly interpolated between rungs.
    0 if even the smallest rung exceeds the budget."""
    d = pool_rungs.sort_values("notional_usd")
    ok = d[d["slippage"] <= threshold]
    if ok.empty:
        return 0.0
    best = float(ok["notional_usd"].max())
    # interpolate into the first failing rung above `best`
    above = d[d["notional_usd"] > best]
    if above.empty:
        return best  # never exceeded the budget within the ladder → report the top rung
    nxt = above.iloc[0]
    last_ok = ok.iloc[-1]
    s0, s1 = float(last_ok["slippage"]), float(nxt["slippage"])
    n0, n1 = float(last_ok["notional_usd"]), float(nxt["notional_usd"])
    if s1 <= s0:
        return best
    return round(n0 + (n1 - n0) * (threshold - s0) / (s1 - s0), 2)


def compute_index(depth_df: pd.DataFrame, thresholds=THRESHOLDS) -> dict:
    """Deterministic: per-pool max-notional at each threshold, aggregated per asset + total.
    Reads committed depth rows so the published index regenerates bit-for-bit."""
    if depth_df.empty:
        return {"pools": 0, "by_threshold": {}, "by_asset": {}}
    by_threshold: dict[str, dict] = {}
    by_asset: dict[str, dict] = {}
    for thr in sorted(thresholds):
        key = f"{thr:.3f}"
        per_pool = []
        for (pool_id, _), g in depth_df.groupby(["pool_id", "major_symbol"], sort=True):
            mn = max_notional_at(g, thr)
            per_pool.append((pool_id, g["major_symbol"].iloc[0], mn))
        total = round(sum(m for _, _, m in per_pool), 2)
        deepest = max(per_pool, key=lambda x: x[2], default=(None, None, 0.0))
        by_threshold[key] = {
            "total_movable_usd": total,
            "deepest_pool": deepest[0],
            "deepest_pool_usd": round(deepest[2], 2),
            "pools_with_any_depth": int(sum(1 for _, _, m in per_pool if m > 0)),
        }
        # per-asset totals at this threshold
        asset_tot: dict[str, float] = {}
        for _, sym, mn in per_pool:
            asset_tot[sym] = asset_tot.get(sym, 0.0) + mn
        for sym, v in asset_tot.items():
            by_asset.setdefault(sym, {})[key] = round(v, 2)
    return {
        "pools": int(depth_df["pool_id"].nunique()),
        "by_threshold": by_threshold,
        "by_asset": by_asset,
    }


def rows_to_frame(rows: list[DepthRow]) -> pd.DataFrame:
    df = pd.DataFrame([dataclasses.asdict(r) for r in rows], columns=DEPTH_FIELDS)
    if df.empty:
        return df
    return df.sort_values(["venue", "pool_id", "notional_usd"], kind="stable").reset_index(
        drop=True
    )
