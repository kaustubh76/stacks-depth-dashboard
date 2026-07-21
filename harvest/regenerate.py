#!/usr/bin/env python
"""Re-run the Stacks Depth harvest and refresh the frontend's baked data.

Run from the repo root:  PYTHONPATH=harvest python harvest/regenerate.py

Harvests fresh on-chain market structure (ALEX/Velar/Bitflow) into a SCRATCH data dir, computes the
study + facts, derives the compact per-pool `depth_ladders.json`, and — only if everything
succeeds — copies the four JSON files into `src/data/`, where the Vite build bakes them in. The
GitHub Actions cron commits any change and Render auto-deploys, so the site's measurement refreshes.

Chain is the source of truth; set HIRO_API_KEY for the fast path (keyless works but throttles).
"""

from __future__ import annotations

import csv
import json
import os
import shutil
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent          # harvest/
REPO = HERE.parent                              # repo root (the Vite app)
SCRATCH = HERE / "_scratch"                     # gitignored harvest output
SRC_DATA = REPO / "src" / "data"

# Point the vendored pipeline's DATA_DIR at the scratch tree BEFORE importing it.
os.environ["ALLOCATOR_DATA_DIR"] = str(SCRATCH)

from ictbot.stacks import store, study, facts  # noqa: E402  (import after env is set)


def _max_notional_at(points: list[tuple[float, float]], thr: float) -> float:
    d = sorted(points)
    ok = [(n, s) for n, s in d if s <= thr]
    if not ok:
        return 0.0
    best = max(n for n, _ in ok)
    above = [(n, s) for n, s in d if n > best]
    if not above:
        return best
    n1, s1 = above[0]
    n0, s0 = ok[-1]
    if s1 <= s0:
        return best
    return round(n0 + (n1 - n0) * (thr - s0) / (s1 - s0), 2)


def derive_depth_ladders(depth_csv: Path) -> list[dict]:
    """Compact per-(pool_id, major_symbol) slippage ladders — mirrors the committed derivation."""
    groups: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
    meta: dict[tuple[str, str], dict] = {}
    with depth_csv.open() as fh:
        for r in csv.DictReader(fh):
            k = (r["pool_id"], r["major_symbol"])
            groups[k].append((float(r["notional_usd"]), float(r["slippage"])))
            meta[k] = {
                "venue": r["venue"],
                "pool_id": r["pool_id"],
                "symbol": r["symbol"],
                "major_symbol": r["major_symbol"],
                "tvl_usd": round(float(r["tvl_usd"]), 2),
            }
    out = []
    for k in sorted(groups):
        pts = sorted(groups[k])
        out.append({
            **meta[k],
            "depth_2pct_usd": _max_notional_at(pts, 0.02),
            "points": [{"notional": n, "slippage": round(s, 6)} for n, s in pts],
        })
    out.sort(key=lambda o: o["depth_2pct_usd"], reverse=True)
    return out


def main() -> int:
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    SCRATCH.mkdir(parents=True, exist_ok=True)

    print("→ harvest + study (chain is source of truth; keyless is slow)…", flush=True)
    study.run_and_save(log=lambda m: print("   " + m, flush=True))  # summary.json + study.json + depth/<date>.csv
    print("→ facts (provenance)…", flush=True)
    facts.write_facts(facts.build_facts())

    stacks_dir = store.STACKS_DATA_DIR
    # newest depth CSV
    depth_csvs = sorted((stacks_dir / "depth").glob("*.csv"))
    if not depth_csvs:
        print("✗ no depth CSV produced — aborting, src/data untouched", file=sys.stderr)
        return 1
    ladders = derive_depth_ladders(depth_csvs[-1])

    required = ["summary.json", "study.json", "facts.json"]
    for name in required:
        if not (stacks_dir / name).exists():
            print(f"✗ missing {name} — aborting, src/data untouched", file=sys.stderr)
            return 1

    SRC_DATA.mkdir(parents=True, exist_ok=True)
    for name in required:
        shutil.copyfile(stacks_dir / name, SRC_DATA / name)
    (SRC_DATA / "depth_ladders.json").write_text(json.dumps(ladders, separators=(",", ":")))

    summary = json.loads((SRC_DATA / "summary.json").read_text())
    print(f"✓ refreshed src/data — as_of {summary.get('as_of_date')} · {len(ladders)} ladders", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
