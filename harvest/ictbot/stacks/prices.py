"""
USD price resolution — and, as a first-class output, cross-checking the two vendor
price feeds against each other.

Two independent sources, both keyed by exact SIP-010 contract principal:
  * Velar ``/tokens`` — broad coverage, live ``price`` per token.
  * ALEX ``/v1/allswaps`` — ``lastBasePriceInUSD`` / ``lastQuotePriceInUSD`` per pool side.

Where both price the same contract we record the ratio (``provenance[c]["agreement"]``);
divergence is a finding, not an error to paper over. Velar is preferred as the primary and
ALEX fills gaps. Cross-venue wrappers of the same asset (e.g. Bitflow ``token-stx-v-1-1`` vs
Velar ``wstx``) are bridged by an explicit, documented ``ALIASES`` map — no fuzzy name
matching, so every price is traceable to a source or a named alias.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

# Canonical "major" symbols — deep, liquid, and safe to use for the TVL half-estimate when
# only one side of a pool is priced. Kept as symbols (not contracts) so every wrapper counts.
MAJOR_SYMBOLS: set[str] = {
    "STX",
    "sBTC",
    "aBTC",
    "xBTC",
    "pBTC",
    "psBTC",
    "aeUSDC",
    "aeUSDT",
    "sUSDT",
    "USDA",
    "USDh",
    "USDC",
    "USDT",
}

# Contracts that a feed prices directly, used as alias targets.
_STX = "SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx"  # Velar-priced STX
_ABTC = "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-abtc"  # priced aBTC (BTC proxy)
_AEUSDC = "SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc"  # priced USDC (~$1)

# Wrapper contract -> a directly-priced contract of the SAME economic asset. Only
# high-confidence 1:1 wrappers (a wrapped STX *is* STX). Long-tail memecoins are left
# unpriced on purpose. Bridged BTC inherits the (published) cross-feed BTC disagreement.
ALIASES: dict[str, str] = {
    # wrapped STX (1:1)
    "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-1": _STX,
    "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2": _STX,
    "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx-v2": _STX,
    # bridged BTC (~BTC)
    "SP14NS8MVBRHXMM96BQY0727AJ59SWPV7RMHC0NCG.pontis-bridge-pBTC": _ABTC,
    "SP14NS8MVBRHXMM96BQY0727AJ59SWPV7RMHC0NCG.pontis-bridge-psBTC": _ABTC,
    # USDC variants (~$1)
    "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx": _AEUSDC,
}

# Symbols we treat as major even when only reachable via alias (for the TVL half-estimate).
_ALIAS_SYMBOL = {_STX: "STX", _ABTC: "aBTC", _AEUSDC: "aeUSDC"}


def _f(v) -> float | None:
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


@dataclass
class PriceBook:
    by_contract: dict[str, float] = field(default_factory=dict)
    symbols: dict[str, str] = field(default_factory=dict)
    provenance: dict[str, dict] = field(default_factory=dict)
    as_of_ts: int = 0

    def price(self, contract: str) -> float | None:
        if contract in self.by_contract:
            return self.by_contract[contract]
        alias = ALIASES.get(contract)
        if alias and alias in self.by_contract:
            return self.by_contract[alias]
        return None

    def symbol(self, contract: str) -> str:
        if contract in self.symbols:
            return self.symbols[contract]
        alias = ALIASES.get(contract, "")
        return self.symbols.get(alias) or _ALIAS_SYMBOL.get(alias, "")

    def is_major(self, contract: str) -> bool:
        sym = self.symbol(contract)
        return sym in MAJOR_SYMBOLS

    def disagreements(self, tol: float = 0.02) -> list[dict]:
        """Contracts where Velar and ALEX price the same token >tol apart — a finding."""
        out = []
        for c, p in self.provenance.items():
            a = p.get("agreement")
            if a is not None and abs(a - 1.0) > tol:
                out.append({"contract": c, "symbol": self.symbols.get(c, ""), **p})
        return out


def build_prices(*, cache_ttl: float = 300.0) -> PriceBook:
    """Assemble the price book from both feeds and record their agreement."""
    from ictbot.stacks.venues import alex, velar  # lazy: avoids an import cycle

    book = PriceBook(as_of_ts=int(time.time()))

    # Collect each feed's price into provenance (do NOT pick yet).
    for t in velar.fetch_tokens(cache_ttl=cache_ttl):
        c = t.get("contractAddress")
        p = _f(t.get("price"))
        if c and p:
            book.symbols[c] = t.get("symbol", "")
            book.provenance.setdefault(c, {})["velar"] = p

    for s in alex.fetch_allswaps(cache_ttl=cache_ttl):
        for cid, price, sym in (
            (s.get("baseId"), _f(s.get("lastBasePriceInUSD")), s.get("baseSymbol")),
            (s.get("quoteId"), _f(s.get("lastQuotePriceInUSD")), s.get("quoteSymbol")),
        ):
            if not cid or price is None:
                continue
            book.provenance.setdefault(cid, {})["alex"] = price
            book.symbols.setdefault(cid, sym or "")

    # Third feed: DexScreener (free, keyless, covers all three venues). Resilient — if it (or
    # the test guard) fails, the book still works on Velar+ALEX. This also adds a fallback when
    # ALEX/Velar are down, and better long-tail coverage.
    try:
        from ictbot.stacks import dexscreener

        for c, p in dexscreener.token_prices(
            dexscreener.fetch_stacks_pairs(cache_ttl=cache_ttl)
        ).items():
            book.provenance.setdefault(c, {})["dexscreener"] = p
            book.symbols.setdefault(c, "")
    except Exception:
        pass

    # Chosen price = MEAN of available feeds (robust to single-feed bias; the feeds disagree on
    # BTC ~7%, so preferring any one would skew TVL). Record pairwise agreement + 3-feed spread.
    for c, p in book.provenance.items():
        vals = [p[k] for k in ("velar", "alex", "dexscreener") if p.get(k)]
        if vals:
            book.by_contract[c] = sum(vals) / len(vals)
        if p.get("velar") and p.get("alex"):
            p["agreement"] = p["velar"] / p["alex"]
        if len(vals) >= 2:  # max fractional spread across the available feeds
            p["spread"] = (max(vals) - min(vals)) / (sum(vals) / len(vals))
        p["chosen"] = book.by_contract.get(c)

    return book
