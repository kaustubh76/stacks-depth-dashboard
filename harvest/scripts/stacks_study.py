#!/usr/bin/env python
"""
Compute the Stacks Depth study (M2): the depth index + market-structure report, derived
deterministically from the committed dataset.

    make stacks_study                 # (re)harvest + depth ladders → commit → write study.json
    make stacks_study ARGS="--check"  # recompute from COMMITTED parquet; fail on any drift

`--check` is the reproducibility proof: it re-derives every published number from the
committed parquet and byte-compares against the committed study.json. Same input → same
output, or exit 1.
"""

from __future__ import annotations

import argparse
import json
import sys
import time

from ictbot.stacks import study


def _print_study(s: dict) -> None:
    ms = s.get("market_structure", {})
    v = s.get("verdict", {})
    idx = s.get("depth_index", {})
    print("\n" + "=" * 68)
    print(f"STACKS DEPTH — study {s.get('as_of_date')}")
    print("=" * 68)
    print("market structure:")
    print(
        f"  pools {ms.get('pools_total')}  dead {ms.get('pools_dead')}  live {ms.get('pools_live')}"
        f"  TVL ${ms.get('tvl_usd_total', 0):,.0f}"
    )
    print(
        f"  24h volume ${ms.get('volume_24h_usd_total', 0):,.0f}"
        f"  (clean, ex-flagged: ${ms.get('volume_24h_usd_clean', 0):,.0f})"
    )
    print("\ndepth index — largest trade at each slippage budget:")
    for thr, d in sorted(idx.get("by_threshold", {}).items()):
        print(
            f"  ≤{float(thr) * 100:>4.1f}%  ${d['total_movable_usd']:>12,.0f} movable total"
            f"   deepest pool ${d['deepest_pool_usd']:>11,.0f} ({d['deepest_pool']})"
        )
    print("\n  movable at ≤2% by asset:")
    for sym, d in sorted(idx.get("by_asset", {}).items(), key=lambda x: -x[1].get("0.020", 0)):
        if d.get("0.020", 0) > 0:
            print(f"    {sym:<8} ${d['0.020']:,.0f}")
    print("\nVERDICT (depth gauge, not a one-shot alpha verdict):")
    print(f"  {v.get('finding', '')}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Stacks Depth study + reproducibility check (M2).")
    ap.add_argument(
        "--check", action="store_true", help="recompute from committed parquet; exit 1 on drift"
    )
    args = ap.parse_args()

    if args.check:
        ok, recomputed, committed = study.check()
        if not committed:
            print("no committed study.json — run `make stacks_study` first", file=sys.stderr)
            return 1
        if ok:
            print("✅ REPRODUCIBLE — study regenerates bit-for-bit from committed parquet")
            _print_study(recomputed)
            return 0
        print("❌ DRIFT — recomputed study does not match committed study.json", file=sys.stderr)
        for k in sorted(set(recomputed) | set(committed)):
            if recomputed.get(k) != committed.get(k):
                print(f"  differs: {k}", file=sys.stderr)
        return 1

    s = study.run_and_save(log=_log)
    _print_study(s)
    print(f"\nwrote study -> {json.loads(json.dumps({'p': str(study.store.STUDY_PATH)}))['p']}")
    return 0


def _log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
