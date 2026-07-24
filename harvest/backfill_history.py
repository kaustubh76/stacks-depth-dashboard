#!/usr/bin/env python
"""One-time seed of src/data/history.json from git history.

Every past re-harvest is a commit of src/data/{summary,study}.json. Walk them, extract ONE point per
`as_of_date` (the latest harvest of that day wins), sort ascending → src/data/history.json. This is
real measured data recovered from git — not synthetic. After seeding, harvest/regenerate.py appends
the current harvest on every cron run, so the series grows.

    python harvest/backfill_history.py
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "src" / "data"


def sh(args: list[str]) -> str:
    return subprocess.run(args, capture_output=True, text=True, cwd=REPO).stdout


def history_point(summary: dict, study: dict) -> dict:
    """The compact set of headline metrics we trend over time."""
    v = study.get("verdict", {})
    return {
        "as_of_date": summary.get("as_of_date"),
        "as_of_ts": summary.get("as_of_ts"),
        "movable_at_2pct_usd": v.get("movable_at_2pct_usd"),
        "deepest_single_pool_usd": v.get("deepest_single_pool_usd"),
        "n_tradeable_assets": v.get("n_tradeable_assets"),
        "rotation_viable": v.get("rotation_viable"),
        "tvl_usd_total": summary.get("tvl_usd_total"),
        "volume_24h_usd_clean": summary.get("volume_24h_usd_clean"),
        "pools_live": summary.get("pools_live"),
        "pools_total": summary.get("pools_total"),
    }


def main() -> int:
    commits = sh(["git", "log", "--format=%H", "--", "src/data/study.json"]).split()  # newest first
    by_date: dict[str, dict] = {}
    for c in commits:
        s = sh(["git", "show", f"{c}:src/data/summary.json"])
        st = sh(["git", "show", f"{c}:src/data/study.json"])
        if not s or not st:
            continue
        try:
            summary, study = json.loads(s), json.loads(st)
        except Exception:
            continue
        d = summary.get("as_of_date")
        if not d or d in by_date:  # newest commit for each date wins (git log is newest-first)
            continue
        by_date[d] = history_point(summary, study)

    hist = [by_date[d] for d in sorted(by_date)]
    SRC.mkdir(parents=True, exist_ok=True)
    (SRC / "history.json").write_text(json.dumps(hist, separators=(",", ":")) + "\n")
    if hist:
        print(f"✓ wrote src/data/history.json — {len(hist)} points ({hist[0]['as_of_date']} → {hist[-1]['as_of_date']})")
    else:
        print("✗ no history recovered from git")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
