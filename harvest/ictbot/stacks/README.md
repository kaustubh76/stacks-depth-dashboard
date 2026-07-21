# Stacks Depth

**Honest, reproducible instrumentation for Stacks DeFi market structure.**
The chain is the source of truth; the vendor APIs are the cross-check. No custody, no funds, read-only.

Stacks DeFi has no honest instrumentation: Bitflow ships no public API, ~90% of ALEX's pools are
dead with nothing surfacing that, and TVL/volume headlines circulate with no reproducible method.
Stacks Depth answers, with evidence anyone can regenerate, three questions:

1. **How much of the liquidity is real?** — an open dataset of every pool across ALEX, Velar, and
   Bitflow, with reserves read **on-chain** (not trusted from an API).
2. **How much capital can actually move, at what slippage?** — a depth index from real on-chain AMM
   quotes (`get-dy` / `get-helper` / stableswap `get-y`). The honest answer to *"can I put $50k to
   work on Stacks?"*
3. **Can other contracts compose against it?** — a read-only Clarity **beacon** that publishes the
   daily index on-chain. No funds, no custody, no audit surface.

## Quickstart

```bash
make stacks_harvest      # M1: enumerate every pool, read reserves on-chain, price + normalize
make stacks_study        # M2: real AMM quotes -> per-pool depth ladders -> depth index + verdict
make stacks_facts        # regenerate every numeric claim in the write-up, with sources
make stacks_docs         # regenerate the headline numbers in the docs from the committed dataset
make stacks_beacon       # M3: verify the read-only beacon (clarinet compile + unit tests)
make stacks_deploy       # generate/print the testnet deploy plan (you apply it with your key)
make stacks_publish      # publish the committed index on-chain via set-depth (DRY by default)
make stacks_dashboard    # regenerate the self-contained dashboard (web-stacks/index.html)
make stacks_serve        # serve the dashboard LIVE + its JSON API (http://localhost:8010/stacks)
make stacks_verify       # run EVERY gate below and print one pass/fail summary
```

## Publishing the index on-chain

The read-only `depth-beacon` contract publishes the daily index (`set-depth(usd, deepest, assets,
ts)`) so other Stacks contracts can compose against it. The write path is real but keyless-by-design:

```bash
make stacks_deploy                              # generate the testnet deploy plan
cd clarity-beacon && clarinet deployments apply --testnet   # you apply it (needs testnet STX)

make stacks_publish                             # DRY: prints the call + encoded args
STACKS_ORACLE_KEY=<hex> make stacks_publish     # signs the tx (still does not send)
STACKS_ORACLE_KEY=<hex> make stacks_publish ARGS="--broadcast"   # actually publishes
```

**Safety:** the oracle key is read only from `STACKS_ORACLE_KEY` (never an argument, never logged),
the default is dry (build + sign, no send), and broadcasting requires an explicit `--broadcast`.
`STACKS_NETWORK` (default `testnet`) selects the beacon target; **data reads are always mainnet**
(there is no real testnet DEX liquidity). Signing/broadcast uses the canonical `@stacks/transactions`
library in `../../../clarity-beacon/scripts/publish.mjs`; the from-scratch SIP-005 codec
(`clarity.py`) is cross-checked against it (see `tests/test_stacks_publish.py`).

## Live UI

`make stacks_serve` runs a small self-contained server (`ictbot.stacks.webapp:app`) that serves the
dashboard **and** the data it renders, reading the committed `data/stacks/*` (no network, read-only):

| Route | Returns |
|---|---|
| `GET /stacks` | the dashboard page (fetches the API below; falls back to baked numbers offline) |
| `GET /api/stacks/summary` | `summary.json` (pool counts, TVL, clean vs flagged volume) |
| `GET /api/stacks/study` | `study.json` (the depth index + the verdict) |
| `GET /api/stacks/facts` | `facts.json` (every claim, with sources) |
| `GET /api/stacks/depth` | the per-pool slippage ladders |
| `GET /api/stacks/dashboard` | `{summary, study, facts}` in one round-trip (what the page fetches) |

The same routes are also mounted into the main app, so `make api` serves `/stacks` too. Opened as a
plain file the dashboard still works — it shows the committed snapshot with a *snapshot* badge; served
live it refreshes the numbers and shows a *live* badge.

## Reproducibility — the point of the whole thing

Every published number regenerates **bit-for-bit** from a committed snapshot, and one command proves it:

```bash
make stacks_verify                          # study + facts + docs reproduce; beacon invariants; pytest -k stacks
make stacks_verify ARGS="--require-clarinet" # also runs the real Clarity compile + vitest unit tests
```

- `make stacks_study --check` — the study recomputes identically from the committed parquet.
- `make stacks_facts --check` — every claim in the proposal recomputes from the dataset.
- `make stacks_docs --check` — the headline tables in the docs match the dataset (no silent drift).
- `make stacks_beacon --check` — the read-only contract's structure + custody-free invariants
  (`--require-clarinet` forces the real `clarinet check` + vitest).

CI (`.github/workflows/stacks.yml`) runs all of it on every change, including the Clarity build.

## What's here

| Area | Files |
|---|---|
| Clarity value codec (SIP-005 + c32check, from scratch) | `clarity.py` |
| Keyless HTTP client (token bucket, stale-cache fallback) | `http.py`, `hiro.py` |
| Venue harvesters (on-chain enumeration + reserves) | `venues/{alex,velar,bitflow}.py`, `venues/base.py` |
| Prices (Velar + ALEX + DexScreener, mean of feeds) | `prices.py`, `dexscreener.py` |
| Dataset store + reproducibility digest | `store.py` |
| Depth index + the published study | `depth.py`, `study.py` |
| Self-verifying facts + doc drift-guard | `facts.py`, `docsync.py` |
| Negative-edge backtest audit | `backtest.py`, `bitflow_volume.py` |
| Read-only Clarity beacon | `../../../clarity-beacon/` |

Full method: [`docs/stacks_methodology.md`](../../../docs/stacks_methodology.md) ·
architecture: [`docs/stacks_architecture.md`](../../../docs/stacks_architecture.md).

## Extraction into a standalone public repo

This package is deliberately self-contained (**zero imports from `strategy/`, `exec/`, etc.**), so it
lifts cleanly into a public Stacks-only repo. There is exactly **one** cross-package dependency and a
small settings shim — see [`docs/stacks_extraction.md`](../../../docs/stacks_extraction.md) for the
copy manifest, the single module to vendor (`engine/portfolio_replay.py`, used only by the backtest
audit), and the `ictbot.settings` constants to provide (`DATA_DIR`, `CACHE_DIR`, `PROJECT_ROOT`).
After extraction, `make stacks_verify` is the acceptance test.

## License

MIT — see [`LICENSE`](LICENSE). Dataset published MIT. No custody, no funds, no private keys.
