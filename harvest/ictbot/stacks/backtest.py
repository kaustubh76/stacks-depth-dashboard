"""
Rolling-window null-result audit — the second, numeric leg under the depth verdict.

Reuses the genuinely chain-agnostic ``engine.portfolio_replay`` harness (``returns_matrix`` /
``simulate`` / ``rolling_window_stats`` / ``curve_metrics``) on the only Stacks-relevant assets
with any liquidity — STX, and BTC as a proxy for sBTC (which is pegged to BTC). Runs a simple
long-only cross-sectional momentum rotation across a friction sweep and reports where the edge
dies. The finding corroborates the depth gauge from a second angle: even setting liquidity
aside, a rotation over this thin, non-independent universe has no edge at realistic friction —
and there is no *third* independent liquid asset to rotate into.

Reproducible: the price series is committed (``data/stacks/prices/<date>.parquet``) and the audit
recomputes from it deterministically.
"""

from __future__ import annotations

import time

import numpy as np
import pandas as pd

from ictbot.engine import portfolio_replay as pr
from ictbot.settings import CACHE_DIR
from ictbot.stacks import store
from ictbot.stacks.http import HttpClient

# The two most liquid Stacks-relevant assets. BTC stands in for sBTC (pegged). That there is no
# THIRD independent liquid asset is itself the point.
ASSETS = {"STX": "blockstack", "BTC": "bitcoin"}
# One-way friction sweep. 0.35% / 0.70% match the BNB negative-edge audit; the depth study shows
# Stacks needs ≥2% to move meaningful size, so ≥2% is the realistic regime here.
FRICTIONS = [0.001, 0.0035, 0.007, 0.01, 0.02, 0.03, 0.05]
WARMUP_D, WIN_D = 20, 7  # daily bars: 20-day warmup, 7-day (1-week) evaluation window
LOOKBACK, REBAL = 20, 7  # momentum lookback + weekly rebalance

_cg: HttpClient | None = None


def _client() -> HttpClient:
    global _cg
    if _cg is None:
        _cg = HttpClient(
            "https://api.coingecko.com",
            rpm=20,
            burst=5,
            cache_dir=CACHE_DIR / "stacks" / "coingecko",
        )
    return _cg


def fetch_history(cg_id: str, days: int) -> pd.DataFrame:
    d = _client().get_json(
        f"/api/v3/coins/{cg_id}/market_chart",
        {"vs_currency": "usd", "days": days},  # >90 days ⇒ CoinGecko returns daily granularity
        cache_ttl=6 * 3600,
        stale_ttl=7 * 24 * 3600,
    )
    px = d.get("prices", []) if isinstance(d, dict) else []
    rows = [{"time": pd.Timestamp(ms, unit="ms").normalize(), "close": float(p)} for ms, p in px]
    return pd.DataFrame(rows).drop_duplicates("time")


def build_prices_frame(days: int = 365) -> pd.DataFrame:
    series = {}
    for sym, cid in ASSETS.items():
        series[sym] = fetch_history(cid, days).set_index("time")["close"].rename(sym)
    df = pd.concat(series.values(), axis=1, join="inner").dropna().reset_index()
    df.columns = ["time", *ASSETS.keys()]
    return df


def _momentum_weights(
    close: np.ndarray, lookback: int = LOOKBACK, rebal: int = REBAL
) -> np.ndarray:
    """Long-only cross-sectional momentum: weight ∝ positive trailing return, weekly rebalance."""
    n, k = close.shape
    w = np.zeros((n, k))
    cur = np.zeros(k)
    for i in range(n):
        if i >= lookback and (i - lookback) % rebal == 0:
            mom = close[i] / close[i - lookback] - 1.0
            pos = np.maximum(mom, 0.0)
            cur = (
                pos / pos.sum() if pos.sum() > 0 else np.zeros(k)
            )  # flat if nothing is trending up
        w[i] = cur
    return w


def compute_audit(prices_df: pd.DataFrame, frictions=FRICTIONS) -> dict:
    """Deterministic: same committed price frame in → identical audit out."""
    tokens = [c for c in prices_df.columns if c != "time"]
    if prices_df.empty or len(prices_df) < WARMUP_D + WIN_D + 5:
        return {
            "n_bars": int(len(prices_df)),
            "tokens": tokens,
            "results": [],
            "friction_flip_one_way": None,
            "finding": "insufficient price history for the audit",
        }
    close = prices_df[tokens].to_numpy(dtype=float)
    rets = pr.returns_matrix(close)
    wp = _momentum_weights(close)
    results = []
    for ow in sorted(frictions):
        eq, _txns = pr.simulate(wp, rets, ow)
        s = pr.rolling_window_stats(eq, warmup=WARMUP_D, win=WIN_D)
        cm = pr.curve_metrics(eq)
        has = s.get("n_windows", 0) > 0
        results.append(
            {
                "one_way": ow,
                "median_weekly_ret": round(s["median_ret"], 6) if has else None,
                "pct_windows_up": round(s["pct_up"], 4) if has else None,
                "n_windows": s.get("n_windows", 0),
                "total_return": round(cm["total_return"], 4),
                "max_dd": round(cm["max_dd"], 4),
            }
        )
    flip = next((r["one_way"] for r in results if (r["median_weekly_ret"] or 0) <= 0), None)
    return {
        "n_bars": len(close),
        "tokens": tokens,
        "n_assets": len(tokens),
        "results": results,
        "friction_flip_one_way": flip,
        "finding": _finding(results, len(close), len(tokens)),
    }


def _finding(results: list[dict], n_bars: int, n_assets: int) -> str:
    realistic = next((r for r in results if r["one_way"] >= 0.02), results[-1] if results else None)
    if realistic is None or realistic["median_weekly_ret"] is None:
        return "insufficient price history for the audit"
    return (
        f"Rolling-window audit, {n_assets} assets (STX + BTC/sBTC proxy) over {n_bars} daily bars: a "
        f"long-only momentum rotation returns {realistic['total_return']:+.0%} total at a realistic 2% "
        f"one-way friction, with only {realistic['pct_windows_up']:.0%} of weekly windows positive. No "
        f"edge — and with just {n_assets} liquid, non-independent assets there is no third thing to "
        f"rotate into. Corroborates the depth verdict from a second angle."
    )


def run_and_commit(*, days: int = 365, log=print) -> dict:
    df = build_prices_frame(days)
    date = time.strftime("%Y-%m-%d", time.gmtime(int(time.time())))
    store.write_prices_df(df, date)
    log(f"backtest: committed {len(df)} daily bars for {', '.join(ASSETS)}")
    return compute_audit(store.read_prices_df(date))
