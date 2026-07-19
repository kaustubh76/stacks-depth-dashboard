# Stacks Depth — Mission Control

A read-only dashboard for the **Stacks Depth** instrument: *how much can actually move on
Stacks DeFi?* It measures on-chain liquidity depth, slippage curves, per-asset movable
capital, and cross-feed data-quality across ALEX, Velar, and Bitflow.

The dashboard ships **fully static** — the committed 2026-07-18 snapshot
(`src/data/*.json`) is baked in at build time, so it renders with zero backend. If a
same-origin `/api/stacks/dashboard` (the `ictbot.stacks.webapp` FastAPI app) is present,
its payload upgrades the page live; on a plain static host that fetch simply no-ops.

Chain is source of truth; vendor APIs are the cross-check. No custody, no funds. MIT.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
npm run preview  # serve the production build
```

## Design system

Reuses the presentation layer of the sibling `bnb-mission-control` dashboard — the `ui/*`
primitives, brutalist theme, and layout shell — re-themed to the Stacks Depth teal palette.
All domain panels (`src/components/panels/*`) are purpose-built for the depth dataset.

## Data

`src/data/{summary,study,facts}.json` are copied verbatim from the repo's committed
`data/stacks/` snapshot. `src/data/depth_ladders.json` is a compact per-pool slippage-ladder
derivation of the deepest pools. Every headline number traces to a claim in `facts.json`.
