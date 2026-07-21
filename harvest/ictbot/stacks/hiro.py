"""
Stacks node reads via the Hiro API — confirmed live and keyless (Degrants.md §15).

Three reads the harvester needs:
  * ``call_read`` — ``POST /v2/contracts/call-read`` → deserialized Clarity value. The
    workhorse: pool registries, reserves, and quote functions all go through here.
  * ``contract_interface`` — ``GET /v2/contracts/interface`` → the function/var/map list.
    Immutable per deployed contract, so cached hard.
  * ``account_transactions`` — ``GET /extended/v1/address/{p}/transactions`` → used to
    enumerate a deployer's ``smart_contract`` txs (legacy Bitflow pool discovery).

Rate limit is unpublished (Degrants.md risk row). We run a conservative bucket + backoff
and expose ``client().stats`` so the real limit can be measured and published as a finding
rather than assumed. Registries/interfaces are cached; only quote ladders are a hot path.
"""

from __future__ import annotations

import os
from typing import Any

from ictbot.settings import CACHE_DIR
from ictbot.stacks import clarity as C
from ictbot.stacks.http import HttpClient, HttpError

HIRO_BASE = "https://api.hiro.so"

# Hiro's KEYLESS call-read limit is very low — measured (W5) ~10 requests then hard 429
# throttling. So keyless we pace deliberately slowly (small burst) to avoid a 429 storm; the
# harvest is then a few minutes, which is fine for a daily batch. Set HIRO_API_KEY (Hiro's free
# tier) to lift the ceiling and run fast. This is a genuine finding: reproducible on-chain
# instrumentation is gated on an API key or a slow keyless crawl.
_API_KEY = os.environ.get("HIRO_API_KEY", "").strip()
HIRO_RPM = 480.0 if _API_KEY else 45.0
HIRO_BURST = 10.0 if _API_KEY else 4.0

# Measured finding (probe 2026-07-18): a rapid keyless burst of 40 call-reads returned 30x HTTP
# 429 after ~10 successes; paced at the rate above it sustains ~37 req/min cleanly (0 retries).
# So Hiro's keyless call-read tier tolerates ~10 burst then hard-throttles — reproducible on-chain
# instrumentation is effectively gated on an API key or a slow keyless crawl.
KEYLESS_MEASURED_RPM = 37
KEYLESS_BURST_BEFORE_429 = 10

# call-read needs a `sender`; any valid mainnet principal works and no funds move.
DEFAULT_SENDER = "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7"

# Cache tiers (seconds).
_TTL_INTERFACE = 30 * 24 * 3600  # contract interfaces are immutable once deployed
_TTL_INTERFACE_STALE = 365 * 24 * 3600

_client: HttpClient | None = None


class HiroError(Exception):
    """A call-read aborted on-chain (``okay: false``), or a node read failed."""


def client() -> HttpClient:
    """Process-wide Hiro client (one bucket). Module-level so tests can swap ``_opener``."""
    global _client
    if _client is None:
        headers = {"x-api-key": _API_KEY} if _API_KEY else {}
        _client = HttpClient(
            HIRO_BASE,
            rpm=HIRO_RPM,
            burst=HIRO_BURST,
            # a batch harvest may legitimately queue a worker for minutes at the keyless rate —
            # wait for the token rather than failing the read (unlike a dashboard request path).
            max_wait_s=900.0,
            cache_dir=CACHE_DIR / "stacks" / "hiro",
            extra_headers=headers,
        )
    return _client


def has_api_key() -> bool:
    return bool(_API_KEY)


def _args(args: list | None) -> list[str]:
    out: list[str] = []
    for a in args or []:
        if isinstance(a, bytes):
            out.append(C.hexarg(a))
        elif isinstance(a, str):
            out.append(a if a.startswith("0x") else "0x" + a)
        else:
            raise TypeError(f"call-read arg must be serialized bytes or hex str, got {type(a)}")
    return out


def call_read(
    contract_id: str,
    fn: str,
    args: list | None = None,
    *,
    sender: str = DEFAULT_SENDER,
    cache_ttl: float = 0.0,
    stale_ttl: float = 0.0,
) -> Any:
    """Read-only contract call. Returns the deserialized Clarity value (often ``Ok(...)`` /
    ``Err(...)`` — the caller unwraps with ``clarity.unwrap``). Raises ``HiroError`` if the
    read aborted on-chain."""
    if "." not in contract_id:
        raise HiroError(f"contract id needs '{{address}}.{{name}}': {contract_id!r}")
    addr, name = contract_id.split(".", 1)
    body = {"sender": sender, "arguments": _args(args)}
    path = f"/v2/contracts/call-read/{addr}/{name}/{fn}"
    resp = client().post_json(path, body, cache_ttl=cache_ttl, stale_ttl=stale_ttl)
    if not isinstance(resp, dict) or not resp.get("okay"):
        cause = resp.get("cause") if isinstance(resp, dict) else resp
        raise HiroError(f"call-read {contract_id}.{fn} aborted: {cause}")
    return C.deserialize(resp["result"])


def contract_interface(contract_id: str) -> dict:
    """The contract's ABI: ``{"functions": [...], "variables": [...], "maps": [...]}``."""
    addr, name = contract_id.split(".", 1)
    return client().get_json(
        f"/v2/contracts/interface/{addr}/{name}",
        cache_ttl=_TTL_INTERFACE,
        stale_ttl=_TTL_INTERFACE_STALE,
    )


def read_only_functions(contract_id: str) -> list[str]:
    iface = contract_interface(contract_id)
    return [f["name"] for f in iface.get("functions", []) if f.get("access") == "read_only"]


def account_transactions(principal: str, *, limit: int = 50, offset: int = 0) -> dict:
    """A page of an account's transactions (used to enumerate deployed contracts)."""
    return client().get_json(
        f"/extended/v1/address/{principal}/transactions",
        {"limit": limit, "offset": offset},
    )


def deployed_contracts(principal: str, *, max_pages: int = 20) -> list[str]:
    """Every ``smart_contract`` contract-id this principal deployed, oldest page first."""
    out: list[str] = []
    for page in range(max_pages):
        try:
            data = account_transactions(principal, limit=50, offset=page * 50)
        except HttpError:
            break
        results = data.get("results", []) if isinstance(data, dict) else []
        for tx in results:
            if tx.get("tx_type") == "smart_contract":
                cid = (tx.get("smart_contract") or {}).get("contract_id")
                if cid:
                    out.append(cid)
        if len(results) < 50:
            break
    return out


def node_info() -> dict:
    """``/v2/info`` — chain tip height, network id, server version (for facts.py)."""
    return client().get_json("/v2/info")
