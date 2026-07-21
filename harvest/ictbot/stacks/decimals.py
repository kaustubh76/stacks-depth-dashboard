"""
Per-token SIP-010 decimals — read once from ``get-decimals``, then cached hard.

Decimals are immutable for a deployed token, so this is the single most cacheable read
in the system: a long-TTL disk cache (via the Hiro client) plus a process-local memo.
Getting decimals right is not optional — it is the difference between the honest ALEX
volume (~$12k top pair) and the raw-integer artifact ($29.5M), i.e. the whole point of
the project. Every reserve and every quote is normalized through here.
"""

from __future__ import annotations

from ictbot.stacks import clarity as C
from ictbot.stacks import hiro

_TTL = 90 * 24 * 3600  # immutable; refresh quarterly only to prune dead cache entries
_TTL_STALE = 3650 * 24 * 3600

# Tokens whose get-decimals is missing/nonstandard. SIP-010 mandates get-decimals, so this
# is normally empty; it exists so a single noncompliant token can't abort a whole harvest.
_OVERRIDES: dict[str, int] = {}

_MEM: dict[str, int] = {}


def decimals(contract_id: str) -> int:
    """SIP-010 decimals for a token contract. Raises ``hiro.HiroError`` only if the token
    is noncompliant *and* not in ``_OVERRIDES`` — callers decide whether that's fatal."""
    if contract_id in _MEM:
        return _MEM[contract_id]
    if contract_id in _OVERRIDES:
        _MEM[contract_id] = _OVERRIDES[contract_id]
        return _MEM[contract_id]
    v = hiro.call_read(contract_id, "get-decimals", cache_ttl=_TTL, stale_ttl=_TTL_STALE)
    d = int(C.unwrap(v))
    if not (0 <= d <= 38):
        raise hiro.HiroError(f"implausible decimals {d} for {contract_id}")
    _MEM[contract_id] = d
    return d


def scale(contract_id: str) -> int:
    """``10 ** decimals`` — the integer divisor from base units to whole tokens."""
    return 10 ** decimals(contract_id)


def to_whole(amount_base: int, contract_id: str) -> float:
    """Base-unit integer amount → whole-token float."""
    return amount_base / scale(contract_id)
