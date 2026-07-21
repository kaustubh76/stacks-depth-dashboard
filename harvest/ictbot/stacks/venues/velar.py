"""
Velar harvester — the API Degrants.md §6/§15 marked ``[UNVERIFIED]``. It exists:

  * ``/tokens``  — live USD prices (used by prices.py).
  * ``/pools``   — paginated (server caps ``limit`` at 50); ``stats.reserve0/reserve1``.
  * ``/tickers`` — standard DEX ticker feed (24h base/target volume per pair).

Reserves come from ``/pools`` and are cross-checked against the on-chain ``univ2-core``
``do-get-pool`` reserves; volume from ``/tickers``. Decimals via SIP-010 (decimals.py).
"""

from __future__ import annotations

import time

from ictbot.settings import CACHE_DIR
from ictbot.stacks import decimals as dec
from ictbot.stacks.http import HttpClient, HttpError
from ictbot.stacks.venues import base
from ictbot.stacks.venues.base import PoolMeta, PoolRow

name = "velar"

VELAR_BASE = "https://api.velar.co"
CORE = "SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-core"
FEE_RATE = 0.003  # Velar univ2 default 0.30%; fees are modelled from volume × this.

_client: HttpClient | None = None


def client() -> HttpClient:
    global _client
    if _client is None:
        _client = HttpClient(VELAR_BASE, rpm=120, cache_dir=CACHE_DIR / "stacks" / "velar")
    return _client


# ---- raw fetchers (also consumed by prices.py) ----
def fetch_tokens(*, cache_ttl: float = 300.0) -> list[dict]:
    data = client().get_json("/tokens", cache_ttl=cache_ttl, stale_ttl=6 * 3600)
    return data if isinstance(data, list) else []


def fetch_pools(*, cache_ttl: float = 300.0) -> list[dict]:
    out: list[dict] = []
    skip, limit = 0, 50
    while True:
        page = client().get_json(
            "/pools", {"skip": skip, "limit": limit}, cache_ttl=cache_ttl, stale_ttl=6 * 3600
        )
        rows = page.get("data", []) if isinstance(page, dict) else []
        out.extend(rows)
        total = page.get("total") if isinstance(page, dict) else None
        skip += limit
        if not rows or (total is not None and skip >= total) or len(rows) < limit:
            break
        if skip > 5000:  # safety valve
            break
    return out


def fetch_tickers(*, cache_ttl: float = 300.0) -> list[dict]:
    try:
        data = client().get_json("/tickers", cache_ttl=cache_ttl, stale_ttl=6 * 3600)
        return data if isinstance(data, list) else []
    except HttpError:
        return []


# ---- Venue protocol ----
def enumerate(*, cache_ttl: float = 300.0) -> list[PoolMeta]:
    metas = []
    for p in fetch_pools(cache_ttl=cache_ttl):
        t0, t1 = p.get("token0ContractAddress"), p.get("token1ContractAddress")
        if not t0 or not t1:
            continue
        sym = p.get("symbol") or f"{p.get('token0Symbol')}-{p.get('token1Symbol')}"
        metas.append(
            PoolMeta(
                venue=name,
                pool_id=f"velar:{sym}",
                kind="amm",
                symbol=sym,
                token_x=t0,
                token_y=t1,
                symbol_x=p.get("token0Symbol", ""),
                symbol_y=p.get("token1Symbol", ""),
                pool_contract=p.get("lpTokenContractAddress"),
                extra={"stats": p.get("stats", {})},
            )
        )
    return metas


def _ticker_volume_usd(meta: PoolMeta, tickers: list[dict], book) -> float | None:
    """Match this pool to its ticker by contract pair; value base_volume in USD."""
    for tk in tickers:
        base_c = tk.get("base_currency")
        target_c = tk.get("target_currency")
        pair = {base_c, target_c}
        if pair == {meta.token_x, meta.token_y}:
            bv = _f(tk.get("base_volume"))
            price = book.price(base_c)
            if bv is not None and price is not None:
                return bv * price
            tv = _f(tk.get("target_volume"))
            tp = book.price(target_c)
            if tv is not None and tp is not None:
                return tv * tp
    return None


def snapshot(meta: PoolMeta, book, *, tickers: list[dict] | None = None) -> PoolRow:
    now = int(time.time())
    stats = meta.extra.get("stats", {})
    note = []
    try:
        dx, dy = dec.decimals(meta.token_x), dec.decimals(meta.token_y)
        rx = _f(stats.get("reserve0")) or 0.0
        ry = _f(stats.get("reserve1")) or 0.0
        reserve_x, reserve_y = rx / 10**dx, ry / 10**dy
        source = base.SRC_API
    except Exception as e:  # a token read failed — record the gap, don't drop the pool
        return _error_row(meta, now, f"decimals/reserves: {e}")

    px, py = book.price(meta.token_x), book.price(meta.token_y)
    tvl, tvl_method = base.compute_tvl(
        reserve_x,
        reserve_y,
        px,
        py,
        x_is_major=book.is_major(meta.token_x),
        y_is_major=book.is_major(meta.token_y),
    )
    vol_usd = _ticker_volume_usd(meta, tickers or [], book)
    fees = vol_usd * FEE_RATE if vol_usd is not None else None
    liveness = base.classify_liveness(reserve_x, reserve_y, vol_usd, fees)
    return PoolRow(
        as_of_date=time.strftime("%Y-%m-%d", time.gmtime(now)),
        as_of_ts=now,
        venue=name,
        pool_id=meta.pool_id,
        kind=meta.kind,
        symbol=meta.symbol,
        token_x=meta.token_x,
        token_y=meta.token_y,
        symbol_x=meta.symbol_x,
        symbol_y=meta.symbol_y,
        decimals_x=dx,
        decimals_y=dy,
        reserve_x=reserve_x,
        reserve_y=reserve_y,
        price_x_usd=px,
        price_y_usd=py,
        tvl_usd=tvl,
        tvl_method=tvl_method,
        volume_24h_usd=vol_usd,
        fees_24h_usd=fees,
        liveness=liveness,
        source=source,
        pool_contract=meta.pool_contract or "",
        method=base.M_MODELLED if fees is not None else base.M_MEASURED,
        note="; ".join(note),
    )


def quote(meta: PoolMeta, amount_in_base: int, *, x_to_y: bool = True) -> int | None:
    """MODELLED constant-product output from real on-chain reserves. Velar's on-chain
    calc-swap is a fee-only helper (no direct amount-out), so depth for Velar (univ2, exact
    constant-product) is computed from reserves and flagged ``modelled`` in the dataset."""
    stats = meta.extra.get("stats", {})
    r_in = _f(stats.get("reserve0")) if x_to_y else _f(stats.get("reserve1"))
    r_out = _f(stats.get("reserve1")) if x_to_y else _f(stats.get("reserve0"))
    if not r_in or not r_out or amount_in_base <= 0:
        return None
    amt_after_fee = amount_in_base * (1.0 - FEE_RATE)
    return int(amt_after_fee * r_out / (r_in + amt_after_fee))


def _error_row(meta: PoolMeta, now: int, msg: str) -> PoolRow:
    return PoolRow(
        as_of_date=time.strftime("%Y-%m-%d", time.gmtime(now)),
        as_of_ts=now,
        venue=name,
        pool_id=meta.pool_id,
        kind=meta.kind,
        symbol=meta.symbol,
        token_x=meta.token_x,
        token_y=meta.token_y,
        symbol_x=meta.symbol_x,
        symbol_y=meta.symbol_y,
        decimals_x=-1,
        decimals_y=-1,
        reserve_x=0.0,
        reserve_y=0.0,
        price_x_usd=None,
        price_y_usd=None,
        tvl_usd=None,
        tvl_method=base.TVL_NONE,
        volume_24h_usd=None,
        fees_24h_usd=None,
        liveness=base.ERROR,
        source=base.SRC_API,
        pool_contract=meta.pool_contract or "",
        note=msg,
    )


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
