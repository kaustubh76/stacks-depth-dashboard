import { useCallback, useEffect, useRef, useState } from "react";

// Shareable scenario state in the URL hash (#b=<budget>&x=<tradeSize>&a=<asset>&v=<view>), so a
// tuned view is a copy-pasteable link. Read once on mount, written back on change via
// replaceState (no history spam). Opening the Trade Plan page uses pushState so browser-back
// returns to the dashboard; popstate re-syncs everything.
//
// SINGLE-WRITER RULE: this hook rewrites the ENTIRE hash. No other code may call
// history.replaceState / pushState / set location.hash, or it will clobber these keys. New hash
// params must be added here.

export const BUDGET_MIN = 0.0025;
export const BUDGET_MAX = 0.05;
export const X_MIN = 100;
export const X_MAX = 100000;

/** The major assets present in the frozen snapshot (distinct `major_symbol` values). */
export const ASSETS = ["STX", "sBTC", "aeUSDC", "aBTC", "USDh"] as const;
export const DEFAULT_ASSET = "STX";

export type View = "dashboard" | "plan";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const validAsset = (a: string | null): string =>
  a && (ASSETS as readonly string[]).includes(a.trim()) ? a.trim() : DEFAULT_ASSET;

function readHash(): { budget: number; moveX: number; asset: string; view: View } {
  const def = { budget: 0.02, moveX: 10000, asset: DEFAULT_ASSET, view: "dashboard" as View };
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const b = parseFloat(h.get("b") ?? "");
    const x = parseFloat(h.get("x") ?? "");
    return {
      budget: Number.isFinite(b) ? clamp(b, BUDGET_MIN, BUDGET_MAX) : def.budget,
      moveX: Number.isFinite(x) ? clamp(x, X_MIN, X_MAX) : def.moveX,
      asset: validAsset(h.get("a")),
      view: h.get("v") === "plan" ? "plan" : "dashboard",
    };
  } catch {
    return def;
  }
}

function hashFor(budget: number, moveX: number, asset: string, view: View): string {
  return `#b=${budget.toFixed(4)}&x=${Math.round(moveX)}&a=${asset}${view === "plan" ? "&v=plan" : ""}`;
}

export interface Scenario {
  budget: number;
  setBudget: (b: number) => void;
  moveX: number;
  setMoveX: (n: number) => void;
  asset: string;
  setAsset: (a: string) => void;
  view: View;
  openPlan: () => void;
  closePlan: () => void;
  shareLink: () => string;
}

export function useScenario(): Scenario {
  const init = readHash();
  const [budget, setBudgetRaw] = useState(init.budget);
  const [moveX, setMoveXRaw] = useState(init.moveX);
  const [asset, setAssetRaw] = useState(init.asset);
  const [view, setViewRaw] = useState<View>(init.view);

  const setBudget = useCallback((b: number) => setBudgetRaw(clamp(b, BUDGET_MIN, BUDGET_MAX)), []);
  const setMoveX = useCallback((n: number) => setMoveXRaw(clamp(Math.round(n), X_MIN, X_MAX)), []);
  const setAsset = useCallback((a: string) => setAssetRaw(validAsset(a)), []);

  // Latest values for the imperative nav callbacks.
  const ref = useRef({ budget, moveX, asset, view });
  ref.current = { budget, moveX, asset, view };

  // Single writer: reflect state → hash (replaceState, no history entry).
  useEffect(() => {
    try {
      window.history.replaceState(null, "", hashFor(budget, moveX, asset, view));
    } catch {
      /* history unavailable — in-memory only */
    }
  }, [budget, moveX, asset, view]);

  // Browser back/forward → re-sync everything from the hash.
  useEffect(() => {
    const onPop = () => {
      const h = readHash();
      setBudgetRaw(h.budget);
      setMoveXRaw(h.moveX);
      setAssetRaw(h.asset);
      setViewRaw(h.view);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Navigate to the Trade Plan page: pushState so browser-back returns to the dashboard.
  const openPlan = useCallback(() => {
    const c = ref.current;
    if (c.view === "plan") return;
    try {
      window.history.pushState(null, "", hashFor(c.budget, c.moveX, c.asset, "plan"));
    } catch {
      /* ignore */
    }
    setViewRaw("plan");
  }, []);

  const closePlan = useCallback(() => setViewRaw("dashboard"), []);

  const shareLink = useCallback(
    () => `${window.location.origin}${window.location.pathname}${hashFor(ref.current.budget, ref.current.moveX, ref.current.asset, ref.current.view)}`,
    [],
  );

  return { budget, setBudget, moveX, setMoveX, asset, setAsset, view, openPlan, closePlan, shareLink };
}
