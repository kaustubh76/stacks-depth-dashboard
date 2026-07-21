"""
DexScreener — a free, keyless DEX aggregator that (verified live 2026-07-18) covers all three
Stacks venues: ALEX, Velar, and Bitflow. Its ``pairAddress`` *is* the pool-contract principal,
so its pairs join our pool rows exactly on ``pool_contract``.

Why it matters here:
  * **Bitflow 24h USD volume** — DexScreener has already indexed the swap events that Bitflow's
    lack of an API otherwise hides, so it gives the real USD figure our on-chain harvest can't
    (W3 could only count swaps). e.g. sBTC/STX ~$1.4k/day.
  * **A third independent feed** — price + liquidity + volume, cross-checked against the chain
    and the ALEX/Velar APIs. More sources = a stronger "no honest instrumentation" finding.
  * **Resilience** — an independent free path when ALEX/Velar are down.

DexScreener 403s the default urllib User-Agent (like ALEX), so we send a browser-ish one. Keyless.
"""

from __future__ import annotations

from ictbot.settings import CACHE_DIR
from ictbot.stacks.http import HttpClient

DS_BASE = "https://api.dexscreener.com"
CHAIN = "stacks"
_UA = "Mozilla/5.0 (compatible; stacks-depth/0.1; honest DeFi instrumentation)"

# Native STX appears as base/quote address "stx"; canonicalize to the priced wSTX contract so it
# joins our price book and ALIASES.
STX_CANON = "SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx"

# Fetching the token-pairs listing for these majors unions to ~the whole tradeable ecosystem
# (STX alone spans ~29 pairs across the three venues).
MAJOR_TOKENS = [
    "stx",
    "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
    "SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc",
    "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-abtc",
]

# Our venue name -> DexScreener ``dexId`` (confirmed live 2026-07-18: alex/velar/bitflow verbatim).
# Used only for the token-pair cross-check fallback; an unknown venue simply stays uncrossed.
VENUE_DEXID = {"alex": "alex", "velar": "velar", "bitflow": "bitflow"}

_client: HttpClient | None = None


def client() -> HttpClient:
    global _client
    if _client is None:
        _client = HttpClient(
            DS_BASE,
            rpm=200,
            burst=8,
            user_agent=_UA,
            cache_dir=CACHE_DIR / "stacks" / "dexscreener",
        )
    return _client


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _norm(addr: str | None) -> str | None:
    return STX_CANON if addr == "stx" else addr


def _canon(addr: str | None) -> str | None:
    """Collapse a token to its canonical priced principal so wrapper variants join across venues
    (e.g. ALEX's ``token-wstx-v2`` and DexScreener's ``wstx`` are the same STX). Reuses the same
    ``ALIASES`` map the price book uses; imported lazily to avoid a prices<->dexscreener cycle."""
    from ictbot.stacks.prices import ALIASES

    a = _norm(addr)
    return ALIASES.get(a, a)


def _pair_key(dex: str | None, a: str | None, b: str | None) -> tuple | None:
    """A venue-scoped, order-independent token-pair key for the volume cross-check."""
    ca, cb = _canon(a), _canon(b)
    if not dex or not ca or not cb:
        return None
    return (dex, frozenset({ca, cb}))


def _parse(p: dict) -> dict:
    return {
        "pair_address": p.get("pairAddress"),
        "dex": p.get("dexId"),
        "base_addr": _norm((p.get("baseToken") or {}).get("address")),
        "quote_addr": _norm((p.get("quoteToken") or {}).get("address")),
        "base_sym": (p.get("baseToken") or {}).get("symbol"),
        "quote_sym": (p.get("quoteToken") or {}).get("symbol"),
        "price_usd": _f(p.get("priceUsd")),
        "volume_h24": _f((p.get("volume") or {}).get("h24")),
        "liquidity_usd": _f((p.get("liquidity") or {}).get("usd")),
        "txns_h24": _txns(p),
    }


def _txns(p: dict) -> int | None:
    h = (p.get("txns") or {}).get("h24") or {}
    b, s = h.get("buys"), h.get("sells")
    return (b or 0) + (s or 0) if (b is not None or s is not None) else None


def fetch_stacks_pairs(*, cache_ttl: float = 300.0) -> dict[str, dict]:
    """Every Stacks pair DexScreener knows, indexed by ``pair_address`` (== pool_contract).
    Unions the token-pairs listing for the majors, with the search endpoint as a backstop."""
    out: dict[str, dict] = {}
    for tok in MAJOR_TOKENS:
        try:
            data = client().get_json(
                f"/token-pairs/v1/{CHAIN}/{tok}", cache_ttl=cache_ttl, stale_ttl=6 * 3600
            )
        except Exception:
            continue
        pairs = data if isinstance(data, list) else (data or {}).get("pairs", [])
        for p in pairs:
            if p.get("chainId") != CHAIN:
                continue
            e = _parse(p)
            if e["pair_address"]:
                out[e["pair_address"]] = e
    try:
        d = client().get_json(
            "/latest/dex/search", {"q": "STX"}, cache_ttl=cache_ttl, stale_ttl=6 * 3600
        )
        for p in d.get("pairs") or []:
            if p.get("chainId") == CHAIN:
                e = _parse(p)
                if e["pair_address"]:
                    out.setdefault(e["pair_address"], e)
    except Exception:
        pass
    return out


def _note(r, tag: str) -> None:
    r.note = f"{r.note}; {tag}" if r.note else tag


def enrich_rows(rows, *, pairs: dict[str, dict] | None = None, cache_ttl: float = 300.0, log=print):
    """Attach DexScreener volume/liquidity to each pool row, in two passes:

    1. **Exact** ``pool_contract == pairAddress`` — clean for Bitflow (per-pool contracts).
       **Bitflow's null on-chain volume is *filled*** from DexScreener's real USD figure (and its
       liveness becomes volume-based, like ALEX/Velar).
    2. **Fallback** ``(dexId, canonical token-pair)`` for rows the exact pass missed — clean for
       ALEX (shared ``amm-pool-v2-01``) and Velar (LP-token addresses), whose ``pairAddress`` is a
       hash, not a principal. This is a **cross-check only**: ALEX/Velar keep their own honest
       ``volume_24h_usd``; only ``volume_24h_usd_dex`` is set.

    Each DexScreener pair is attributed **once**: pairs consumed by the exact pass are excluded
    from the fallback aggregate, and each token-pair key is claimed by the single deepest matching
    row (others get a ``dex_xcheck=shared`` note), so ``volume_24h_usd_dex_total`` never
    double-counts. Mutates rows in place."""
    from ictbot.stacks.venues import base

    if pairs is None:
        pairs = fetch_stacks_pairs(cache_ttl=cache_ttl)
    if not pairs:
        return

    # --- pass 1: exact pool_contract match ---
    consumed_addrs: set[str] = set()
    exact = 0
    for r in rows:
        e = pairs.get(r.pool_contract)
        if e is None:
            continue
        exact += 1
        consumed_addrs.add(r.pool_contract)
        r.volume_24h_usd_dex = e.get("volume_h24")
        r.liquidity_usd_dex = e.get("liquidity_usd")
        if r.venue == "bitflow" and e.get("volume_h24") is not None:
            r.volume_24h_usd = e["volume_h24"]
            r.liveness = base.classify_liveness(
                r.reserve_x, r.reserve_y, r.volume_24h_usd, r.fees_24h_usd
            )
            _note(r, "volume_source=dexscreener")

    # --- fallback aggregate over DexScreener pairs NOT already consumed exactly ---
    by_key: dict[tuple, dict] = {}
    for addr, e in pairs.items():
        if addr in consumed_addrs:
            continue
        key = _pair_key(e.get("dex"), e.get("base_addr"), e.get("quote_addr"))
        if key is None:
            continue
        agg = by_key.setdefault(key, {"volume": 0.0, "liquidity": 0.0, "n": 0})
        agg["volume"] += e.get("volume_h24") or 0.0
        agg["liquidity"] += e.get("liquidity_usd") or 0.0
        agg["n"] += 1

    # --- pass 2: fallback (dex, token-pair) — deepest row per key wins, once ---
    def _depth(r) -> float:
        v = getattr(r, "tvl_usd", None)
        if v:
            return float(v)
        return float((r.reserve_x or 0) + (r.reserve_y or 0))

    candidates: dict[tuple, list] = {}
    for r in rows:
        if r.pool_contract in consumed_addrs:  # already matched exactly
            continue
        key = _pair_key(VENUE_DEXID.get(r.venue), r.token_x, r.token_y)
        if key is not None and key in by_key:
            candidates.setdefault(key, []).append(r)

    fallback = 0
    for key, rs in candidates.items():
        rs.sort(key=_depth, reverse=True)
        agg = by_key[key]
        winner = rs[0]
        winner.volume_24h_usd_dex = agg["volume"]
        winner.liquidity_usd_dex = agg["liquidity"] or None
        _note(winner, "dex_xcheck")
        fallback += 1
        for other in rs[1:]:
            _note(other, "dex_xcheck=shared")

    log(
        f"dexscreener: {exact} exact + {fallback} token-pair cross-checks "
        f"(Bitflow volume filled; ALEX/Velar volume cross-checked)"
    )


def token_prices(pairs: dict[str, dict]) -> dict[str, float]:
    """token contract → USD price, taken from the deepest pair where the token is the base
    (DexScreener's ``priceUsd`` is the base token's USD price)."""
    best: dict[str, tuple[float, float]] = {}  # addr -> (liquidity, price)
    for e in pairs.values():
        addr, px, liq = e["base_addr"], e["price_usd"], e["liquidity_usd"] or 0.0
        if addr and px and px > 0 and liq >= best.get(addr, (-1.0, 0.0))[0]:
            best[addr] = (liq, px)
    return {a: p for a, (_liq, p) in best.items()}
