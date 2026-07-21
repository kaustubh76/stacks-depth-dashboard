"""
Stacks Depth — honest instrumentation for Stacks DeFi market structure.

A self-contained package (no imports from ``ictbot.strategy`` / ``ictbot.engine``
except the chain-agnostic replay harness) so it can be extracted into a clean
public repo later. It harvests per-pool liquidity/volume/fees across ALEX, Velar,
and Bitflow, computes a daily depth index from real on-chain AMM quotes, and
publishes the result — cross-validating the vendor APIs against the chain itself.

Layers (bottom-up):
  http.py      keyless REST client (token bucket + backoff + injectable opener)
  clarity.py   Clarity value serialization codec (SIP-005) + c32 address encoding
  hiro.py      Stacks node reads: call-read, contract interface, account txs
  decimals.py  per-token SIP-010 decimals (immutable → disk-cached)
"""

from __future__ import annotations

__all__ = ["clarity", "http", "hiro", "decimals"]
