"""
ALEX harvester — the venue whose own two public endpoints contradict each other, which
is the sharpest "no honest instrumentation" finding in the project.

Design (the project thesis in miniature): **chain is truth, API is cross-check.**
  * enumerate  — ``/v2/public/pools`` (168 pools; also carries the API's own numbers).
  * reserves   — on-chain ``amm-pool-v2-01.get-balances(token-x, token-y, factor)``, the
    authoritative reserves. (The API's ``balance_x`` is exactly 1e10x the chain value — an
    undocumented scale we record rather than trust.) Read only for pools the API flags as
    non-empty; the ~136 zero-balance pools are dead regardless, so we skip the RPC.
  * volume     — ``/v1/allswaps`` ``baseVolume x lastBasePriceInUSD`` (honest USD). This is
    the number that corrects Degrants.md's "STX/ALEX $75k" (a raw-token-count-as-dollars
    error) to ~$12k.

``get-helper(token-x, token-y, factor, dx)`` is the on-chain quote fn used by the Phase-3
depth ladder.
"""

from __future__ import annotations

import time

from ictbot.settings import CACHE_DIR
from ictbot.stacks import decimals as dec
from ictbot.stacks import hiro
from ictbot.stacks.clarity import cv_contract_principal, cv_uint, unwrap
from ictbot.stacks.http import HttpClient
from ictbot.stacks.venues import base
from ictbot.stacks.venues.base import PoolMeta, PoolRow

name = "alex"

ALEX_BASE = "https://api.alexgo.io"
POOL_CONTRACT = "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.amm-pool-v2-01"
FEE_RATE = 0.003  # fees modelled from honest volume; ALEX fee fields are opaquely scaled.
# ALEX 403s the default urllib UA; a browser-ish UA is accepted.
_UA = "Mozilla/5.0 (compatible; stacks-depth/0.1; honest DeFi instrumentation)"

_client: HttpClient | None = None


def client() -> HttpClient:
    global _client
    if _client is None:
        _client = HttpClient(
            ALEX_BASE, rpm=120, cache_dir=CACHE_DIR / "stacks" / "alex", user_agent=_UA
        )
    return _client


def fetch_pools(*, cache_ttl: float = 300.0) -> list[dict]:
    d = client().get_json("/v2/public/pools", cache_ttl=cache_ttl, stale_ttl=6 * 3600)
    return d.get("data", []) if isinstance(d, dict) else []


def fetch_allswaps(*, cache_ttl: float = 300.0) -> list[dict]:
    d = client().get_json("/v1/allswaps", cache_ttl=cache_ttl, stale_ttl=6 * 3600)
    return d if isinstance(d, list) else []


def enumerate(*, cache_ttl: float = 300.0) -> list[PoolMeta]:
    swaps = {s["id"]: s for s in fetch_allswaps(cache_ttl=cache_ttl)}
    metas = []
    for p in fetch_pools(cache_ttl=cache_ttl):
        pid = p["pool_id"]
        s = swaps.get(pid, {})
        metas.append(
            PoolMeta(
                venue=name,
                pool_id=f"alex:{pid}",
                kind="amm",
                symbol=f"{s.get('baseSymbol', '?')}-{s.get('quoteSymbol', '?')}",
                token_x=p["token_x"],
                token_y=p["token_y"],
                symbol_x=s.get("baseSymbol", ""),
                symbol_y=s.get("quoteSymbol", ""),
                pool_contract=POOL_CONTRACT,
                extra={"api_pool": p, "swap": s, "native_id": pid},
            )
        )
    return metas


def _honest_volume_usd(swap: dict) -> float | None:
    """allswaps baseVolume is in whole base tokens; value it at the live USD price."""
    bv, bp = _f(swap.get("baseVolume")), _f(swap.get("lastBasePriceInUSD"))
    if bv is not None and bp is not None:
        return bv * bp
    qv, qp = _f(swap.get("quoteVolume")), _f(swap.get("lastQuotePriceInUSD"))
    if qv is not None and qp is not None:
        return qv * qp
    return None


def _chain_reserves(meta: PoolMeta) -> tuple[float, float, int, int]:
    """Authoritative on-chain reserves (whole tokens) + decimals via get-balances."""
    api = meta.extra["api_pool"]
    # factor is immutable per pool → cache hard; only get-balances (reserves) stays fresh.
    factor = int(
        unwrap(
            hiro.call_read(
                POOL_CONTRACT,
                "get-pool-details-by-id",
                [cv_uint(api["pool_id"])],
                cache_ttl=30 * 24 * 3600,
            )
        )["factor"]
    )
    bal = unwrap(
        hiro.call_read(
            POOL_CONTRACT,
            "get-balances",
            [
                cv_contract_principal(meta.token_x),
                cv_contract_principal(meta.token_y),
                cv_uint(factor),
            ],
        )
    )
    dx, dy = dec.decimals(meta.token_x), dec.decimals(meta.token_y)
    return int(bal["balance-x"]) / 10**dx, int(bal["balance-y"]) / 10**dy, dx, dy


def snapshot(meta: PoolMeta, book) -> PoolRow:
    now = int(time.time())
    api = meta.extra["api_pool"]
    swap = meta.extra["swap"]
    api_has_balance = (_f(api.get("balance_x")) or 0) > 0 and (_f(api.get("balance_y")) or 0) > 0
    vol_usd = _honest_volume_usd(swap)
    note = []
    source = base.SRC_API

    reserve_x = reserve_y = 0.0
    dx = dy = -1
    if api_has_balance:
        try:
            reserve_x, reserve_y, dx, dy = _chain_reserves(meta)
            source = base.SRC_BOTH  # reserves on-chain, enumerated via API
        except Exception as e:
            note.append(f"chain reserves failed: {e}")
            return base_error_row(meta, now, "; ".join(note))

    px, py = book.price(meta.token_x), book.price(meta.token_y)
    tvl, tvl_method = base.compute_tvl(
        reserve_x,
        reserve_y,
        px,
        py,
        x_is_major=book.is_major(meta.token_x),
        y_is_major=book.is_major(meta.token_y),
    )
    fees = vol_usd * FEE_RATE if vol_usd is not None else None
    liveness = base.classify_liveness(reserve_x, reserve_y, vol_usd, fees)

    # cross-check: the API's own balance, descaled (÷1e10÷10**dec), should reproduce tvl.
    tvl_api = None
    if api_has_balance and dx >= 0 and px is not None and py is not None:
        rx_api = (_f(api["balance_x"]) or 0) / 1e10 / 10**dx
        ry_api = (_f(api["balance_y"]) or 0) / 1e10 / 10**dy
        tvl_api = rx_api * px + ry_api * py
    # data-quality flag: implausible turnover (venue endpoints disagree on this pool)
    if vol_usd and tvl and tvl > 0 and vol_usd / tvl > 100:
        note.append(f"turnover {vol_usd / tvl:.0f}x/day — likely endpoint inconsistency")

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
        pool_contract=POOL_CONTRACT,
        tvl_usd_api=tvl_api,
        agreement_ratio=base.agreement(tvl, tvl_api),
        method=base.M_MODELLED if fees is not None else base.M_MEASURED,
        note="; ".join(note),
    )


def quote(meta: PoolMeta, amount_in_base: int, *, x_to_y: bool = True) -> int | None:
    """Real on-chain quote via get-helper(token-x, token-y, factor, dx). MEASURED output
    (base units of the other token), or None if the read aborts (e.g. exceeds max-in-ratio)."""
    tx, ty = (meta.token_x, meta.token_y) if x_to_y else (meta.token_y, meta.token_x)
    try:
        factor = int(
            unwrap(
                hiro.call_read(
                    POOL_CONTRACT,
                    "get-pool-details-by-id",
                    [cv_uint(meta.extra["native_id"])],
                    cache_ttl=6 * 3600,
                )
            )["factor"]
        )
        return int(
            unwrap(
                hiro.call_read(
                    POOL_CONTRACT,
                    "get-helper",
                    [
                        cv_contract_principal(tx),
                        cv_contract_principal(ty),
                        cv_uint(factor),
                        cv_uint(amount_in_base),
                    ],
                )
            )
        )
    except Exception:
        return None  # ALEX reverts past max-in-ratio — a real depth ceiling, recorded as such


def base_error_row(meta: PoolMeta, now: int, msg: str) -> PoolRow:
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
        pool_contract=POOL_CONTRACT,
        note=msg,
    )


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
