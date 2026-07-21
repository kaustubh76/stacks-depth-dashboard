"""
The contract every venue harvester satisfies, plus the shared row schema.

``PoolMeta`` is the cheap registry view (id + contracts + tokens), enumerated once per
harvest. ``PoolRow`` is the daily fact — one per pool — carrying reserves, USD-normalized
TVL/volume/fees, a liveness flag, and the cross-validation fields (``*_api`` +
``agreement_ratio``) that make the dataset independently checkable. The cross-validation
columns are first-class, not an afterthought: publishing where the chain and a vendor API
disagree *is* the product.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

# ---- controlled vocabularies (kept as plain strings so parquet/CSV stay legible) ----
LIVE = "live"  # reserves > 0 on both sides AND (real 24h volume > 0 OR fees accrued)
DORMANT = "dormant"  # reserves on both sides, but no 24h activity
DEAD = "dead"  # missing/zero reserves — the 152/168 case
ERROR = "error"  # a read failed; the row records the gap honestly rather than dropping it

SRC_CHAIN = "chain"
SRC_API = "api"
SRC_BOTH = "chain+api"

M_MEASURED = "measured"  # from a real on-chain read / quote
M_MODELLED = "modelled"  # from a constant-product model when a real read was unavailable

TVL_BOTH = "both"  # both sides independently priced
TVL_HALF = "half"  # one side priced (a major); TVL = 2x that side, flagged
TVL_NONE = "none"  # neither side priced


@dataclass
class PoolMeta:
    """Registry-level pool identity — cheap, no reserves/quotes yet."""

    venue: str
    pool_id: str  # canonical, globally unique: e.g. "alex:6", "velar:STX-aBTC", "bitflow:xyk:4"
    kind: str  # "amm" | "xyk" | "stableswap"
    symbol: str  # human pair label, e.g. "STX-aeUSDC"
    token_x: str  # contract principal (SIP-010)
    token_y: str
    symbol_x: str = ""
    symbol_y: str = ""
    pool_contract: str | None = None
    extra: dict = field(default_factory=dict)  # venue-specific (ALEX factor, native int id, ...)


@dataclass
class PoolRow:
    """One pool, one harvest instant. Field order here IS the committed column order."""

    as_of_date: str  # UTC YYYY-MM-DD (the harvest day / partition key)
    as_of_ts: int  # exact unix harvest instant
    venue: str
    pool_id: str
    kind: str
    symbol: str
    token_x: str
    token_y: str
    symbol_x: str
    symbol_y: str
    decimals_x: int
    decimals_y: int
    reserve_x: float  # whole tokens (base units / 10**decimals)
    reserve_y: float
    price_x_usd: float | None
    price_y_usd: float | None
    tvl_usd: float | None
    tvl_method: str
    volume_24h_usd: float | None
    fees_24h_usd: float | None
    liveness: str
    source: str
    pool_contract: str = ""
    # ---- cross-validation: what the vendor API claims vs what we computed on-chain ----
    tvl_usd_api: float | None = None
    volume_24h_usd_api: float | None = None
    # ---- DexScreener (a third, free feed; matched by pool_contract == pairAddress) ----
    volume_24h_usd_dex: float | None = None
    liquidity_usd_dex: float | None = None
    agreement_ratio: float | None = (
        None  # our_value / api_value for the headline metric (1.0 = agree)
    )
    method: str = M_MEASURED
    # 24h swap count — the reliable Bitflow activity signal (per-pool USD volume needs event-level
    # token attribution that multi-hop routing obscures). None where not measured.
    swaps_24h: int | None = None
    note: str = ""


FIELD_ORDER: list[str] = [f.name for f in dataclasses.fields(PoolRow)]


@runtime_checkable
class Venue(Protocol):
    """A venue harvester. ``enumerate`` reads the registry; ``snapshot`` turns one pool into
    a row given a USD price book; ``quote`` returns a real on-chain output amount (base units)
    for the depth ladder, or None if the venue has no quote function for that pool."""

    name: str

    def enumerate(self) -> list[PoolMeta]: ...

    def snapshot(self, meta: PoolMeta, prices) -> PoolRow: ...

    def quote(self, meta: PoolMeta, amount_in_base: int, *, x_to_y: bool = True) -> int | None: ...


def classify_liveness(
    reserve_x: float, reserve_y: float, volume_24h_usd: float | None, fees_24h_usd: float | None
) -> str:
    """The single liveness rule, shared by every venue so the dead-pool count is consistent."""
    if reserve_x <= 0 or reserve_y <= 0:
        return DEAD
    if (volume_24h_usd or 0) > 0 or (fees_24h_usd or 0) > 0:
        return LIVE
    return DORMANT


def compute_tvl(
    reserve_x: float,
    reserve_y: float,
    price_x: float | None,
    price_y: float | None,
    *,
    x_is_major: bool = False,
    y_is_major: bool = False,
) -> tuple[float | None, str]:
    """Value each side by its own USD price and sum. If only a *major* side is priced, use
    2x it as an estimate (valid at the constant-product margin), flagged ``half``. This is the
    honest degradation for a pool holding one unpriced long-tail token."""
    vx = reserve_x * price_x if price_x is not None else None
    vy = reserve_y * price_y if price_y is not None else None
    if vx is not None and vy is not None:
        return vx + vy, TVL_BOTH
    if vx is not None and x_is_major:
        return 2.0 * vx, TVL_HALF
    if vy is not None and y_is_major:
        return 2.0 * vy, TVL_HALF
    if vx is not None:
        return vx + (vy or 0.0), TVL_HALF
    if vy is not None:
        return vy + (vx or 0.0), TVL_HALF
    return None, TVL_NONE


def agreement(ours: float | None, theirs: float | None) -> float | None:
    """Ratio ours/theirs, guarded. 1.0 = agree; far from 1.0 = the finding. None if either
    side is missing or the denominator is ~0 (can't form a ratio honestly)."""
    if ours is None or theirs is None:
        return None
    if abs(theirs) < 1e-9:
        return None
    return ours / theirs
