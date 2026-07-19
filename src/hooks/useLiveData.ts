import { useCallback, useEffect, useRef, useState } from "react";

// Genuine client-side live data from public, CORS-open endpoints. This is the ONLY live
// surface — it never overwrites a snapshot number; it feeds the clearly-labelled "Live
// cross-check" strip. Every fetch is best-effort (AbortController + try/catch): on any
// failure the slice stays null and the UI falls back to SNAPSHOT, so the page never blanks.

export interface LivePrice {
  usd: number;
  change24h: number | null;
}

export interface LiveState {
  chainHeight: number | null; // Stacks tip height (Hiro)
  burnHeight: number | null; // Bitcoin burn block (Hiro)
  stx: LivePrice | null; // CoinGecko
  btc: LivePrice | null; // CoinGecko
  dexVolume24h: number | null; // Σ DexScreener Stacks pairs
  dexPairs: number | null;
  updatedChain: number | null; // epoch ms of last success, per source
  updatedPrice: number | null;
  updatedDex: number | null;
  anyLive: boolean;
}

const EMPTY: LiveState = {
  chainHeight: null,
  burnHeight: null,
  stx: null,
  btc: null,
  dexVolume24h: null,
  dexPairs: null,
  updatedChain: null,
  updatedPrice: null,
  updatedDex: null,
  anyLive: false,
};

const HIRO = "https://api.hiro.so/v2/info";
const COINGECKO =
  "https://api.coingecko.com/api/v3/simple/price?ids=blockstack,bitcoin&vs_currencies=usd&include_24hr_change=true";
const DEXSCREENER = "https://api.dexscreener.com/latest/dex/search?q=STX%20sBTC";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function getJson(url: string, signal: AbortSignal): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null; // aborted / offline / CORS — caller keeps the prior slice
  }
}

/**
 * Polls three independent public feeds at their own cadences and exposes a merged live
 * state plus a manual `refresh()` (wired to ⌘K / the `r` key / the header toggle).
 */
export function useLiveData(enabled: boolean): { live: LiveState; refresh: () => void } {
  const [live, setLive] = useState<LiveState>(EMPTY);
  const [nonce, setNonce] = useState(0);
  const acRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    acRef.current = ac;
    let mounted = true;

    const patch = (p: Partial<LiveState>) =>
      mounted && setLive((s) => ({ ...s, ...p, anyLive: true }));

    const pollChain = async () => {
      const d = (await getJson(HIRO, ac.signal)) as { stacks_tip_height?: unknown; burn_block_height?: unknown } | null;
      if (d) patch({ chainHeight: num(d.stacks_tip_height), burnHeight: num(d.burn_block_height), updatedChain: Date.now() });
    };
    const pollPrice = async () => {
      const d = (await getJson(COINGECKO, ac.signal)) as
        | { blockstack?: { usd?: unknown; usd_24h_change?: unknown }; bitcoin?: { usd?: unknown; usd_24h_change?: unknown } }
        | null;
      if (d) {
        const stxUsd = num(d.blockstack?.usd);
        const btcUsd = num(d.bitcoin?.usd);
        patch({
          stx: stxUsd === null ? null : { usd: stxUsd, change24h: num(d.blockstack?.usd_24h_change) },
          btc: btcUsd === null ? null : { usd: btcUsd, change24h: num(d.bitcoin?.usd_24h_change) },
          updatedPrice: Date.now(),
        });
      }
    };
    const pollDex = async () => {
      const d = (await getJson(DEXSCREENER, ac.signal)) as { pairs?: Array<Record<string, unknown>> } | null;
      if (d && Array.isArray(d.pairs)) {
        const stacks = d.pairs.filter((p) => p.chainId === "stacks");
        const vol = stacks.reduce((s, p) => {
          const v = p.volume as { h24?: unknown } | undefined;
          return s + (num(v?.h24) ?? 0);
        }, 0);
        patch({ dexVolume24h: vol, dexPairs: stacks.length, updatedDex: Date.now() });
      }
    };

    // Fire all three immediately, then on independent intervals.
    void pollChain();
    void pollPrice();
    void pollDex();
    const iChain = window.setInterval(pollChain, 15_000);
    const iPrice = window.setInterval(pollPrice, 30_000);
    const iDex = window.setInterval(pollDex, 60_000);

    return () => {
      mounted = false;
      ac.abort();
      window.clearInterval(iChain);
      window.clearInterval(iPrice);
      window.clearInterval(iDex);
    };
  }, [enabled, nonce]);

  return { live, refresh };
}
