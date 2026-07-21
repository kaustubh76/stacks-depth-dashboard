"""
Bitflow harvester — the venue Degrants.md §11 called "the single biggest unknown"
(no public API). Resolved entirely on-chain: each core contract is a canonical pool
registry.

  * enumerate — for each core, ``get-last-pool-id`` then ``get-pool-by-id(1..N)`` →
    pool-contract; then ``get-pool`` on that contract → tokens + reserves (stashed).
  * reserves  — ``x-balance`` / ``y-balance`` from ``get-pool``, ÷ SIP-010 decimals.
    Authoritative, on-chain, no API involved.
  * volume    — **not available.** Bitflow has no API and per-pool 24h volume would need
    swap-event indexing. We record ``volume_24h_usd = None`` and disclose the gap rather
    than fabricate it. Liveness is therefore reserve-based for Bitflow (documented).
  * depth     — ``get-dy(dx)`` on the pool contract is the real quote fn (Phase-3 ladder),
    and correct for stableswap curves where a constant-product model would be wrong.

Enumerated via the current cores; both carry pools whose logic core is an older version
(pool 1's ``core-address`` is xyk-core-v-1-1 yet it lists in v-1-2's registry), so the
current registries are comprehensive. Legacy-only pools, if any, are a disclosed gap.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor

from ictbot.stacks import decimals as dec
from ictbot.stacks import hiro
from ictbot.stacks.clarity import Some, cv_uint, unwrap
from ictbot.stacks.venues import base
from ictbot.stacks.venues.base import PoolMeta, PoolRow

name = "bitflow"

DEPLOYER = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR"
# Current cores first (canonical pool_ids), then legacy cores — enumerate dedupes by
# pool-contract, so a pool listed under several cores is counted once, but any legacy-only
# pool the current registries miss is now included.
CORES = [
    ("xyk", f"{DEPLOYER}.xyk-core-v-1-2"),
    ("stableswap", f"{DEPLOYER}.stableswap-core-v-1-4"),
    ("xyk", f"{DEPLOYER}.xyk-core-v-1-1"),
    ("stableswap", f"{DEPLOYER}.stableswap-core-v-1-3"),
    ("stableswap", f"{DEPLOYER}.stableswap-core-v-1-2"),
    ("stableswap", f"{DEPLOYER}.stableswap-core-v-1-1"),
]
_REG_TTL = 6 * 3600  # registries change slowly; cache the id->pool mapping


def enumerate(*, cache_ttl: float = 300.0, workers: int = 12) -> list[PoolMeta]:
    # Gather every (kind, core, pool-id) across all cores, then fetch pool details in parallel —
    # the per-pool get-pool-by-id + get-pool reads are latency-bound and dominate a cold harvest.
    tasks: list[tuple[str, str, int]] = []
    for kind, core in CORES:
        try:
            last = int(unwrap(hiro.call_read(core, "get-last-pool-id", cache_ttl=_REG_TTL)))
        except Exception:
            continue
        tasks += [(kind, core, pid) for pid in range(1, last + 1)]

    def _fetch(task: tuple[str, str, int]) -> PoolMeta | None:
        kind, core, pid = task
        try:
            rec = unwrap(hiro.call_read(core, "get-pool-by-id", [cv_uint(pid)], cache_ttl=_REG_TTL))
            if isinstance(rec, Some):
                rec = rec.value
            if rec is None:
                return None
            pc = rec["pool-contract"]
            gp = unwrap(hiro.call_read(pc, "get-pool", cache_ttl=cache_ttl))
            return PoolMeta(
                venue=name,
                pool_id=f"bitflow:{kind}:{pid}",
                kind=kind,
                symbol=gp.get("pool-symbol") or rec.get("symbol") or f"{kind}:{pid}",
                token_x=gp["x-token"],
                token_y=gp["y-token"],
                pool_contract=pc,
                extra={"get_pool": gp, "core": core},
            )
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=workers) as ex:
        results = list(ex.map(_fetch, tasks))

    metas: list[PoolMeta] = []
    seen: set[str] = set()
    for m in results:  # dedupe by pool-contract (a pool may list under multiple cores)
        if m and m.pool_contract not in seen:
            seen.add(m.pool_contract)
            metas.append(m)
    return metas


def snapshot(meta: PoolMeta, book) -> PoolRow:
    now = int(time.time())
    gp = meta.extra["get_pool"]
    try:
        dx, dy = dec.decimals(meta.token_x), dec.decimals(meta.token_y)
        reserve_x = int(gp["x-balance"]) / 10**dx
        reserve_y = int(gp["y-balance"]) / 10**dy
    except Exception as e:
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
    # Bitflow liveness is reserve-based (no volume feed): both sides funded above dust.
    if reserve_x <= 0 or reserve_y <= 0 or (tvl is not None and tvl < 1.0):
        liveness = base.DEAD
    else:
        liveness = base.LIVE
    sym_x = meta.token_x.split(".")[-1]
    sym_y = meta.token_y.split(".")[-1]
    return PoolRow(
        as_of_date=time.strftime("%Y-%m-%d", time.gmtime(now)),
        as_of_ts=now,
        venue=name,
        pool_id=meta.pool_id,
        kind=meta.kind,
        symbol=meta.symbol,
        token_x=meta.token_x,
        token_y=meta.token_y,
        symbol_x=book.symbol(meta.token_x) or sym_x,
        symbol_y=book.symbol(meta.token_y) or sym_y,
        decimals_x=dx,
        decimals_y=dy,
        reserve_x=reserve_x,
        reserve_y=reserve_y,
        price_x_usd=px,
        price_y_usd=py,
        tvl_usd=tvl,
        tvl_method=tvl_method,
        volume_24h_usd=None,
        fees_24h_usd=None,
        liveness=liveness,
        source=base.SRC_CHAIN,
        pool_contract=meta.pool_contract or "",
        method=base.M_MEASURED,
        note="volume unavailable (no Bitflow API); liveness=reserve-based",
    )


def quote(meta: PoolMeta, amount_in_base: int, *, x_to_y: bool = True) -> int | None:
    """Output base units of the other token — see quote_detail for the method used."""
    return quote_detail(meta, amount_in_base, x_to_y=x_to_y)[0]


def quote_detail(
    meta: PoolMeta, amount_in_base: int, *, x_to_y: bool = True
) -> tuple[int | None, str]:
    """Real AMM output + how it was obtained. Fallback chain, because Bitflow pools differ:
      1. embedded pool ``get-dy``/``get-dx``  → MEASURED (older pools)
      2. stableswap core ``get-y``/``get-x``  → MEASURED (exact curve; these are the deep pools)
      3. xyk constant-product from reserves    → MODELLED (newer xyk pools expose no quote fn)
    A real revert at a large size (not "undefined function") is a genuine depth ceiling → None.
    """
    fn = "get-dy" if x_to_y else "get-dx"
    try:
        return int(
            unwrap(hiro.call_read(meta.pool_contract, fn, [cv_uint(amount_in_base)]))
        ), "measured"
    except hiro.HiroError as e:
        if "UndefinedFunction" not in str(e):
            return None, "measured"  # function exists but reverted here = the pool's ceiling
    except Exception:
        return None, "measured"

    gp = meta.extra.get("get_pool", {})
    if meta.kind == "stableswap":
        return _stableswap_quote(meta, gp, amount_in_base, x_to_y), "measured"
    return _xyk_model(gp, amount_in_base, x_to_y), "modelled"


def _stableswap_quote(meta: PoolMeta, gp: dict, amt: int, x_to_y: bool) -> int | None:
    """Exact stableswap output via the core's get-y/get-x (dy = y_bal − get-y(x_bal+dx))."""
    core = gp.get("core-address") or meta.extra.get("core")
    try:
        amp = int(gp["amplification-coefficient"])
        thr = int(gp["convergence-threshold"])
        xbal, ybal = int(gp["x-balance"]), int(gp["y-balance"])
    except (KeyError, ValueError, TypeError):
        return None
    try:
        if x_to_y:
            new_y = int(
                unwrap(
                    hiro.call_read(
                        core,
                        "get-y",
                        [cv_uint(amt), cv_uint(xbal), cv_uint(ybal), cv_uint(amp), cv_uint(thr)],
                    )
                )
            )
            return max(0, ybal - new_y)
        new_x = int(
            unwrap(
                hiro.call_read(
                    core,
                    "get-x",
                    [cv_uint(amt), cv_uint(ybal), cv_uint(xbal), cv_uint(amp), cv_uint(thr)],
                )
            )
        )
        return max(0, xbal - new_x)
    except Exception:
        return None


def _xyk_model(gp: dict, amt: int, x_to_y: bool) -> int | None:
    """Constant-product output from real reserves (0.30% fee) — for xyk pools with no quote fn."""
    try:
        xbal, ybal = int(gp["x-balance"]), int(gp["y-balance"])
    except (KeyError, ValueError, TypeError):
        return None
    r_in, r_out = (xbal, ybal) if x_to_y else (ybal, xbal)
    if r_in <= 0 or r_out <= 0 or amt <= 0:
        return None
    amt_fee = amt * (1.0 - 0.003)
    return int(amt_fee * r_out / (r_in + amt_fee))


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
        symbol_x="",
        symbol_y="",
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
        source=base.SRC_CHAIN,
        pool_contract=meta.pool_contract or "",
        note=msg,
    )
