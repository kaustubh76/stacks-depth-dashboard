"""
The committed dataset store — per-pool, per-day rows as Parquet (+ a human-diffable CSV),
plus a rollup ``summary.json`` the dashboard/API reads cheaply.

Deliberately NOT ``ictbot.data.cache`` — that module dedupes on a ``time`` column
(``cache.py:50``); pool rows key on ``(as_of_date, venue, pool_id)`` and would ``KeyError``.
This mirrors its *shape* (parquet, ``mkdir(parents=True)``, atomic-ish write, deterministic
column order) with the right key. It lives under ``data/stacks/`` — which the harvest step
un-ignores in ``.gitignore`` so the dataset is actually committed (M1's whole deliverable).

The harvest is a live snapshot: re-running it tomorrow yields different numbers because the
chain moved — that is expected and honest (each row is timestamped). Reproducibility applies
to the *study* (Phase 3), which regenerates published numbers deterministically from a
*committed* parquet. ``dataset_digest`` gives the method-level check M1 acceptance needs
(the dead-pool count reproduces), independent of pyarrow's writer metadata.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import os
from pathlib import Path

import pandas as pd

from ictbot.settings import DATA_DIR
from ictbot.stacks.venues.base import DEAD, ERROR, FIELD_ORDER, LIVE, PoolRow

STACKS_DATA_DIR = DATA_DIR / "stacks"
POOLS_DIR = STACKS_DATA_DIR / "pools"
DEPTH_DIR = STACKS_DATA_DIR / "depth"
PRICES_DIR = STACKS_DATA_DIR / "prices"
SUMMARY_PATH = STACKS_DATA_DIR / "summary.json"
STUDY_PATH = STACKS_DATA_DIR / "study.json"


def _frame(rows: list[PoolRow]) -> pd.DataFrame:
    df = pd.DataFrame([dataclasses.asdict(r) for r in rows], columns=FIELD_ORDER)
    # Deterministic order: same rows in → same file out (independent of harvest order).
    df = df.sort_values(["venue", "pool_id"], kind="stable").reset_index(drop=True)
    return df[FIELD_ORDER]


def write_pool_rows(rows: list[PoolRow], date: str) -> dict:
    """Write the day's rows to parquet + CSV under ``data/stacks/pools/``. Returns paths."""
    POOLS_DIR.mkdir(parents=True, exist_ok=True)
    df = _frame(rows)
    pq = POOLS_DIR / f"{date}.parquet"
    csv = POOLS_DIR / f"{date}.csv"
    df.to_parquet(pq, index=False)
    df.to_csv(csv, index=False)
    return {"parquet": str(pq), "csv": str(csv), "rows": int(len(df)), "digest": dataset_digest(df)}


def read_pool_rows(date: str | None = None) -> pd.DataFrame:
    """Read one day's rows (latest committed if ``date`` is None). Empty frame if none."""
    if date is None:
        date = latest_date()
    if date is None:
        return pd.DataFrame(columns=FIELD_ORDER)
    return pd.read_parquet(POOLS_DIR / f"{date}.parquet")


def list_dates() -> list[str]:
    if not POOLS_DIR.exists():
        return []
    return sorted(p.stem for p in POOLS_DIR.glob("*.parquet"))


def latest_date() -> str | None:
    dates = list_dates()
    return dates[-1] if dates else None


def dataset_digest(df: pd.DataFrame) -> str:
    """SHA-256 over a canonical CSV of the *data* (sorted, fixed columns). Stable across
    pyarrow versions — the study's reproducibility check compares this, not parquet bytes."""
    # reindex (not []-select) so an older committed parquet missing a newer column doesn't crash
    canon = df.sort_values(["venue", "pool_id"], kind="stable").reindex(columns=FIELD_ORDER)
    return hashlib.sha256(canon.to_csv(index=False).encode()).hexdigest()


def summarize(df: pd.DataFrame, *, as_of_ts: int, as_of_date: str) -> dict:
    """Rollup the day's rows into the headline counts M1 reports and the dashboard shows."""
    venues: dict[str, dict] = {}
    for venue, g in df.groupby("venue"):
        live = int((g["liveness"] == LIVE).sum())
        dead = int((g["liveness"] == DEAD).sum())
        err = int((g["liveness"] == ERROR).sum())
        venues[str(venue)] = {
            "pools": int(len(g)),
            "live": live,
            "dead": dead,
            "dormant": int(len(g)) - live - dead - err,
            "error": err,
            "tvl_usd": _fsum(g["tvl_usd"]),
            "volume_24h_usd": _fsum(g["volume_24h_usd"]),
            # DexScreener (third feed): 24h USD volume it reports for this venue's matched pools
            "volume_24h_usd_dex": _fsum(g["volume_24h_usd_dex"])
            if "volume_24h_usd_dex" in g
            else 0.0,
            # 24h swap count (Bitflow activity signal; 0 where volume-based instead)
            "swaps_24h": int(pd.to_numeric(g.get("swaps_24h"), errors="coerce").fillna(0).sum())
            if "swaps_24h" in g
            else 0,
            # how often our on-chain number and the vendor API disagree by >20%
            "api_disagreements": _disagreements(g),
        }
    total = len(df)
    dead_total = int((df["liveness"] == DEAD).sum())
    # A single ALEX pool (bridged-btc/bridged-usdt) reports implausible turnover — the two
    # ALEX volume endpoints disagree. Splitting it out is the honest headline: the *entire*
    # rest-of-ecosystem 24h volume is a few thousand dollars, not tens of millions.
    flagged_mask = df["note"].astype(str).str.contains("turnover", case=False, na=False)
    vol_total = _fsum(df["volume_24h_usd"])
    vol_flagged = _fsum(df.loc[flagged_mask, "volume_24h_usd"])
    flagged = [
        {
            "pool_id": r["pool_id"],
            "symbol": r["symbol"],
            "volume_24h_usd": _f(r["volume_24h_usd"]),
            "note": r["note"],
        }
        for _, r in df[flagged_mask].iterrows()
    ]
    return {
        "as_of_date": as_of_date,
        "as_of_ts": int(as_of_ts),
        "pools_total": int(total),
        "pools_dead": dead_total,
        "pools_live": int((df["liveness"] == LIVE).sum()),
        "dead_fraction": round(dead_total / total, 4) if total else None,
        "tvl_usd_total": _fsum(df["tvl_usd"]),
        "volume_24h_usd_total": vol_total,
        "volume_24h_usd_flagged": vol_flagged,
        "volume_24h_usd_clean": vol_total - vol_flagged,
        # DexScreener's independent 24h volume total — an external cross-check on our clean figure
        "volume_24h_usd_dex_total": _fsum(df["volume_24h_usd_dex"])
        if "volume_24h_usd_dex" in df
        else 0.0,
        "flagged_pools": flagged,
        "venues": venues,
        "digest": dataset_digest(df),
    }


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _fsum(series) -> float:
    return float(pd.to_numeric(series, errors="coerce").fillna(0.0).sum())


def _disagreements(g: pd.DataFrame, tol: float = 0.20) -> int:
    r = pd.to_numeric(g.get("agreement_ratio"), errors="coerce")
    return int(((r < (1 - tol)) | (r > (1 + tol))).sum())


def write_summary(summary: dict) -> Path:
    STACKS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = SUMMARY_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(summary, indent=2, sort_keys=True))
    os.replace(tmp, SUMMARY_PATH)  # atomic
    return SUMMARY_PATH


def read_summary() -> dict | None:
    if not SUMMARY_PATH.exists():
        return None
    try:
        return json.loads(SUMMARY_PATH.read_text())
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Depth ladders + study (Phase 3 / M2)
# --------------------------------------------------------------------------- #


def write_depth_df(df: pd.DataFrame, date: str) -> dict:
    """Commit the day's depth ladders (data/stacks/depth/). The study derives its index
    from this committed parquet, so the published numbers are reproducible."""
    DEPTH_DIR.mkdir(parents=True, exist_ok=True)
    pq = DEPTH_DIR / f"{date}.parquet"
    csv = DEPTH_DIR / f"{date}.csv"
    df.to_parquet(pq, index=False)
    df.to_csv(csv, index=False)
    return {"parquet": str(pq), "csv": str(csv), "rows": int(len(df)), "digest": _digest_df(df)}


def read_depth_df(date: str | None = None) -> pd.DataFrame:
    if date is None:
        dates = sorted(p.stem for p in DEPTH_DIR.glob("*.parquet")) if DEPTH_DIR.exists() else []
        date = dates[-1] if dates else None
    if date is None or not (DEPTH_DIR / f"{date}.parquet").exists():
        return pd.DataFrame()
    return pd.read_parquet(DEPTH_DIR / f"{date}.parquet")


def write_prices_df(df: pd.DataFrame, date: str) -> dict:
    """Commit the daily price series the backtest audit runs on, so it reproduces from data."""
    PRICES_DIR.mkdir(parents=True, exist_ok=True)
    pq = PRICES_DIR / f"{date}.parquet"
    df.to_parquet(pq, index=False)
    df.to_csv(PRICES_DIR / f"{date}.csv", index=False)
    return {"parquet": str(pq), "rows": int(len(df)), "digest": _digest_df(df)}


def read_prices_df(date: str | None = None) -> pd.DataFrame:
    if date is None:
        dates = sorted(p.stem for p in PRICES_DIR.glob("*.parquet")) if PRICES_DIR.exists() else []
        date = dates[-1] if dates else None
    if date is None or not (PRICES_DIR / f"{date}.parquet").exists():
        return pd.DataFrame()
    return pd.read_parquet(PRICES_DIR / f"{date}.parquet")


def _digest_df(df: pd.DataFrame) -> str:
    return hashlib.sha256(df.to_csv(index=False).encode()).hexdigest()


def write_study(study: dict) -> Path:
    STACKS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STUDY_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(study, indent=2, sort_keys=True))
    os.replace(tmp, STUDY_PATH)
    return STUDY_PATH


def read_study() -> dict | None:
    if not STUDY_PATH.exists():
        return None
    try:
        return json.loads(STUDY_PATH.read_text())
    except Exception:
        return None
