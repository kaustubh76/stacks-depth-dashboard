import { useCallback, useEffect, useState } from "react";

// Shareable scenario state in the URL hash (#b=<budget>&x=<tradeSize>&a=<asset>), so a tuned
// view is a copy-pasteable link. Read once on mount, written back on change via replaceState
// (no history spam).
//
// SINGLE-WRITER RULE: this hook's effect rewrites the ENTIRE hash. No other code may call
// history.replaceState / set location.hash, or it will clobber these keys. New hash params
// must be added here.

export const BUDGET_MIN = 0.0025;
export const BUDGET_MAX = 0.05;
export const X_MIN = 100;
export const X_MAX = 100000;

/** The major assets present in the frozen snapshot (distinct `major_symbol` values). */
export const ASSETS = ["STX", "sBTC", "aeUSDC", "aBTC", "USDh"] as const;
export const DEFAULT_ASSET = "STX";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const validAsset = (a: string | null): string =>
  a && (ASSETS as readonly string[]).includes(a.trim()) ? a.trim() : DEFAULT_ASSET;

function readHash(): { budget: number; moveX: number; asset: string } {
  const def = { budget: 0.02, moveX: 10000, asset: DEFAULT_ASSET };
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const b = parseFloat(h.get("b") ?? "");
    const x = parseFloat(h.get("x") ?? "");
    return {
      budget: Number.isFinite(b) ? clamp(b, BUDGET_MIN, BUDGET_MAX) : def.budget,
      moveX: Number.isFinite(x) ? clamp(x, X_MIN, X_MAX) : def.moveX,
      asset: validAsset(h.get("a")),
    };
  } catch {
    return def;
  }
}

export interface Scenario {
  budget: number;
  setBudget: (b: number) => void;
  moveX: number;
  setMoveX: (n: number) => void;
  asset: string;
  setAsset: (a: string) => void;
  shareLink: () => string;
}

export function useScenario(): Scenario {
  const init = readHash();
  const [budget, setBudgetRaw] = useState(init.budget);
  const [moveX, setMoveXRaw] = useState(init.moveX);
  const [asset, setAssetRaw] = useState(init.asset);

  const setBudget = useCallback((b: number) => setBudgetRaw(clamp(b, BUDGET_MIN, BUDGET_MAX)), []);
  const setMoveX = useCallback((n: number) => setMoveXRaw(clamp(Math.round(n), X_MIN, X_MAX)), []);
  const setAsset = useCallback((a: string) => setAssetRaw(validAsset(a)), []);

  useEffect(() => {
    const hash = `#b=${budget.toFixed(4)}&x=${Math.round(moveX)}&a=${asset}`;
    try {
      window.history.replaceState(null, "", hash);
    } catch {
      /* history unavailable — in-memory only */
    }
  }, [budget, moveX, asset]);

  const shareLink = useCallback(
    () =>
      `${window.location.origin}${window.location.pathname}#b=${budget.toFixed(4)}&x=${Math.round(moveX)}&a=${asset}`,
    [budget, moveX, asset],
  );

  return { budget, setBudget, moveX, setMoveX, asset, setAsset, shareLink };
}
