"""
Bitflow 24h activity — the honest completion of the one null data field.

Bitflow has no API, and a *reliable USD* per-pool volume is genuinely hard: the transactions
list carries ``function_args`` but not the ft-transfer events, and ``swap-helper-a`` is a
multi-hop router whose args don't identify the input token — so USD attribution would need a
per-tx event read (expensive under Hiro's keyless rate limit) or router decoding. Rather than
fabricate a USD number, we publish a **reliable 24h swap-count** activity signal and disclose
the USD gap. Bounded: at most ``max_pages`` × 50 txs per pool, live pools only.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from ictbot.stacks import hiro
from ictbot.stacks.venues.base import LIVE, PoolRow

_PAGE = 50
_DAY_S = 86_400


def _block_ts(tx: dict) -> int | None:
    bt = tx.get("block_time")
    if isinstance(bt, (int, float)):
        return int(bt)
    iso = tx.get("block_time_iso")
    if iso:
        try:
            return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())
        except (ValueError, AttributeError):
            return None
    return None


def pool_swaps_24h(pool_contract: str, *, now: int, max_pages: int = 3) -> tuple[int, bool]:
    """Count swap contract-calls touching this pool in the last 24h. Returns (count, capped)."""
    cutoff = now - _DAY_S
    count, offset, capped = 0, 0, False
    for page in range(max_pages):
        try:
            d = hiro.client().get_json(
                f"/extended/v2/addresses/{pool_contract}/transactions",
                {"limit": _PAGE, "offset": offset},
                cache_ttl=120,
                stale_ttl=3600,
            )
        except Exception:
            break
        results = d.get("results", []) if isinstance(d, dict) else []
        if not results:
            break
        stop = False
        for t in results:
            tx = t.get("tx", t)
            ts = _block_ts(tx)
            if ts is not None and ts < cutoff:
                stop = True
                break
            fn = (tx.get("contract_call") or {}).get("function_name", "") or ""
            if "swap" in fn:
                count += 1
        if stop:
            break
        offset += _PAGE
        if page == max_pages - 1 and len(results) == _PAGE:
            capped = True  # hit the page cap while still inside the 24h window
    return count, capped


def enrich_rows(
    rows: list[PoolRow], *, now: int | None = None, max_pages: int = 3, workers: int = 8, log=print
) -> None:
    """Fill ``swaps_24h`` on Bitflow LIVE rows (bounded, parallel). Mutates rows in place."""
    now = now or int(time.time())
    targets = [r for r in rows if r.venue == "bitflow" and r.liveness == LIVE and r.pool_contract]
    if not targets:
        return

    def _do(r: PoolRow) -> None:
        c, capped = pool_swaps_24h(r.pool_contract, now=now, max_pages=max_pages)
        r.swaps_24h = c
        tag = f"swaps_24h={c}{'+capped' if capped else ''}"
        r.note = f"{r.note}; {tag}" if r.note else tag

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(_do, targets))
    log(f"bitflow activity: {len(targets)} live pools enriched with 24h swap counts")
