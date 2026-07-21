"""
Harvest orchestration — enumerate every venue, snapshot every pool, roll up a summary.

The single expensive pass is ``collect()``: it enumerates each venue and snapshots every pool
**once, in parallel** (the on-chain reserve/registry reads are latency-bound, so a bounded
worker pool over the thread-safe ``HttpClient`` is a large win). ``run_harvest`` builds the
dataset from it; the study reuses the same triples for the depth ladders instead of reading the
chain a second time.

Per-pool failures never abort the run: each venue's ``snapshot`` returns an ``ERROR`` row that
records the gap, so the dataset stays honest about what it couldn't read.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from ictbot.stacks import prices, store
from ictbot.stacks.venues import alex, bitflow, velar
from ictbot.stacks.venues.base import PoolMeta, PoolRow

ALL_VENUES = ("alex", "velar", "bitflow")
_VENUE_MODS = {"alex": alex, "velar": velar, "bitflow": bitflow}

# (venue_module, PoolMeta, PoolRow) — the shared unit reused by the dataset and the depth ladders.
Triple = tuple[object, PoolMeta, PoolRow]


def collect(
    book,
    *,
    venues: tuple[str, ...] = ALL_VENUES,
    cache_ttl: float = 300.0,
    workers: int = 12,
    log: Callable[[str], None] = print,
) -> list[Triple]:
    """Enumerate + snapshot every pool ONCE, snapshots in parallel. Returns (mod, meta, row)."""
    t0 = time.time()
    jobs: list[tuple] = []
    for vname in venues:
        mod = _VENUE_MODS[vname]
        metas = mod.enumerate(cache_ttl=cache_ttl)
        log(f"{vname}: {len(metas)} pools enumerated ({time.time() - t0:.1f}s)")
        if vname == "velar":
            tickers = velar.fetch_tickers(cache_ttl=cache_ttl)
            jobs += [(mod, m, tickers) for m in metas]
        else:
            jobs += [(mod, m, None) for m in metas]

    def _snap(job):
        mod, meta, tickers = job
        if tickers is not None:
            return velar.snapshot(meta, book, tickers=tickers)
        return mod.snapshot(meta, book)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        rows = list(ex.map(_snap, jobs))
    triples: list[Triple] = [(j[0], j[1], r) for j, r in zip(jobs, rows, strict=True)]
    log(f"collect: {len(triples)} pools snapshotted ({time.time() - t0:.1f}s)")
    return triples


def summarize_rows(rows: list[PoolRow], book, *, t0: float | None = None) -> dict:
    now = int(time.time())
    date = time.strftime("%Y-%m-%d", time.gmtime(now))
    df = store._frame(rows)
    summary = store.summarize(df, as_of_ts=now, as_of_date=date)
    summary["price_disagreements"] = book.disagreements(0.02)
    summary["hiro_stats"] = dict(_hiro_stats())
    if t0 is not None:
        summary["elapsed_s"] = round(time.time() - t0, 1)
    return summary


def run_harvest(
    *,
    venues: tuple[str, ...] = ALL_VENUES,
    cache_ttl: float = 300.0,
    workers: int = 8,
    log: Callable[[str], None] = print,
    book=None,
    triples: list[Triple] | None = None,
    bitflow_activity: bool = True,
) -> tuple[list[PoolRow], dict]:
    """Build the dataset. ``book``/``triples`` may be passed in so the study reuses one pass."""
    t0 = time.time()
    if book is None:
        book = prices.build_prices(cache_ttl=cache_ttl)
        log(f"prices: {len(book.by_contract)} contracts ({time.time() - t0:.1f}s)")
    if triples is None:
        triples = collect(book, venues=venues, cache_ttl=cache_ttl, workers=workers, log=log)
    rows = [r for _, _, r in triples]
    if bitflow_activity and "bitflow" in venues:
        from ictbot.stacks import bitflow_volume

        bitflow_volume.enrich_rows(rows, workers=workers, log=log)
    # DexScreener (free, third feed): fills Bitflow's real USD volume + a cross-check for all.
    try:
        from ictbot.stacks import dexscreener

        dexscreener.enrich_rows(rows, log=log)
    except Exception as e:
        log(f"dexscreener enrich skipped: {e}")
    summary = summarize_rows(rows, book, t0=t0)
    return rows, summary


def _hiro_stats() -> dict:
    from ictbot.stacks import hiro

    return hiro.client().stats
