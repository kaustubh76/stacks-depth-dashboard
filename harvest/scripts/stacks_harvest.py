#!/usr/bin/env python
"""
Harvest Stacks DeFi liquidity/market-structure across ALEX, Velar, and Bitflow and
publish the open dataset (M1). Chain is the source of truth; the vendor APIs are the
cross-check.

    make stacks_harvest                    # full harvest, write data/stacks/
    make stacks_harvest ARGS="--no-save"   # dry run, print the headline only
    make stacks_harvest ARGS="--venues bitflow"   # one venue
    make stacks_harvest ARGS="--coverage"  # price-coverage + feed-disagreement report

The dataset is a live snapshot (timestamped); re-running tomorrow yields different numbers
because the chain moved. Reproducibility is the *study*'s job (make stacks_study), which
regenerates published numbers deterministically from a committed parquet.
"""

from __future__ import annotations

import argparse
import sys
import time

from ictbot.stacks import prices, store
from ictbot.stacks.harvest import ALL_VENUES, run_harvest


def _coverage_report() -> int:
    from collections import Counter

    from ictbot.stacks.venues import alex, bitflow, velar

    book = prices.build_prices()
    print(f"priced contracts: {len(book.by_contract)}")
    metas = alex.enumerate() + velar.enumerate() + bitflow.enumerate()
    unpriced: Counter = Counter()
    for m in metas:
        for tok in (m.token_x, m.token_y):
            if book.price(tok) is None:
                unpriced[tok.split(".")[-1]] += 1
    print(f"\nunpriced tokens ({len(unpriced)} distinct), top 20 by pool count:")
    for sym, n in unpriced.most_common(20):
        print(f"  {n:>3}x  {sym}")
    print("\nprice-feed disagreements (Velar vs ALEX, >2%):")
    for d in book.disagreements(0.02):
        print(
            f"  {d.get('symbol', ''):<12} velar=${d.get('velar')} "
            f"alex=${d.get('alex')} ratio={d.get('agreement'):.3f}"
        )
    return 0


def _print_headline(summary: dict) -> None:
    print("\n" + "=" * 66)
    print(f"STACKS DEPTH — harvest {summary['as_of_date']}  ({summary.get('elapsed_s')}s)")
    print("=" * 66)
    print(f"pools total   : {summary['pools_total']}")
    print(
        f"pools dead    : {summary['pools_dead']}  ({(summary.get('dead_fraction') or 0) * 100:.1f}%)"
    )
    print(f"pools live    : {summary['pools_live']}")
    print(f"TVL total     : ${summary['tvl_usd_total']:,.0f}")
    print(f"24h volume    : ${summary['volume_24h_usd_total']:,.0f}")
    print(
        f"  of which flagged (endpoint-inconsistent): ${summary.get('volume_24h_usd_flagged', 0):,.0f}"
    )
    print(
        f"  CLEAN 24h volume (ex-flagged)           : ${summary.get('volume_24h_usd_clean', 0):,.0f}"
    )
    print("\nper venue:")
    for v, s in sorted(summary["venues"].items()):
        print(
            f"  {v:8} pools={s['pools']:>3} live={s['live']:>3} dead={s['dead']:>3} "
            f"tvl=${s['tvl_usd']:>13,.0f} vol=${s['volume_24h_usd']:>12,.0f} "
            f"api!=chain:{s['api_disagreements']}"
        )
    dis = summary.get("price_disagreements") or []
    if dis:
        print(f"\nprice-feed disagreements (>2%): {len(dis)}")
        for d in dis[:5]:
            print(f"  {d.get('symbol', ''):<10} velar=${d.get('velar')} alex=${d.get('alex')}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Harvest Stacks DeFi market structure (M1).")
    ap.add_argument("--venues", nargs="+", default=list(ALL_VENUES), choices=ALL_VENUES)
    ap.add_argument(
        "--no-save", action="store_true", help="print headline only; don't write dataset"
    )
    ap.add_argument("--coverage", action="store_true", help="price-coverage + disagreement report")
    ap.add_argument("--cache-ttl", type=float, default=300.0)
    args = ap.parse_args()

    if args.coverage:
        return _coverage_report()

    rows, summary = run_harvest(venues=tuple(args.venues), cache_ttl=args.cache_ttl, log=_log)
    _print_headline(summary)

    if not args.no_save:
        date = summary["as_of_date"]
        paths = store.write_pool_rows(rows, date)
        store.write_summary(summary)
        print(f"\nwrote {paths['rows']} rows -> {paths['parquet']}")
        print(f"       {paths['csv']}")
        print(f"digest {paths['digest'][:16]}…  summary -> {store.SUMMARY_PATH}")
    return 0


def _log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
