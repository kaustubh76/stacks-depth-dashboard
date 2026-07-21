import { useCallback, useEffect, useRef, useState } from "react";

// Shareable scenario + route state in the URL hash
// (#b=<budget>&x=<tradeSize>&a=<asset>&v=<view>&p=<poolKey>), so a tuned view is a copy-pasteable
// link. Read once on mount, written back on change via replaceState (no history spam). Opening a
// page (Trade Plan / Pool detail) uses pushState so browser-back returns to the dashboard;
// popstate re-syncs everything.
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

export type View = "dashboard" | "plan" | "pool";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const validAsset = (a: string | null): string =>
  a && (ASSETS as readonly string[]).includes(a.trim()) ? a.trim() : DEFAULT_ASSET;

function readHash(): { budget: number; moveX: number; asset: string; view: View; pool: string | null } {
  const def = { budget: 0.02, moveX: 10000, asset: DEFAULT_ASSET, view: "dashboard" as View, pool: null };
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const b = parseFloat(h.get("b") ?? "");
    const x = parseFloat(h.get("x") ?? "");
    const vRaw = h.get("v");
    let view: View = vRaw === "plan" ? "plan" : vRaw === "pool" ? "pool" : "dashboard";
    let pool: string | null = null;
    if (view === "pool") {
      const p = h.get("p");
      if (p) pool = decodeURIComponent(p);
      else view = "dashboard"; // v=pool without a key → dashboard
    }
    return {
      budget: Number.isFinite(b) ? clamp(b, BUDGET_MIN, BUDGET_MAX) : def.budget,
      moveX: Number.isFinite(x) ? clamp(x, X_MIN, X_MAX) : def.moveX,
      asset: validAsset(h.get("a")),
      view,
      pool,
    };
  } catch {
    return def;
  }
}

function hashFor(budget: number, moveX: number, asset: string, view: View, pool: string | null): string {
  let s = `#b=${budget.toFixed(4)}&x=${Math.round(moveX)}&a=${asset}`;
  if (view === "plan") s += "&v=plan";
  else if (view === "pool" && pool) s += `&v=pool&p=${encodeURIComponent(pool)}`;
  return s;
}

export interface Scenario {
  budget: number;
  setBudget: (b: number) => void;
  moveX: number;
  setMoveX: (n: number) => void;
  asset: string;
  setAsset: (a: string) => void;
  view: View;
  pool: string | null;
  openPlan: () => void;
  openPool: (key: string) => void;
  closePlan: () => void; // alias of goDashboard (kept for existing callers)
  goDashboard: () => void;
  shareLink: () => string;
}

export function useScenario(): Scenario {
  const init = readHash();
  const [budget, setBudgetRaw] = useState(init.budget);
  const [moveX, setMoveXRaw] = useState(init.moveX);
  const [asset, setAssetRaw] = useState(init.asset);
  const [view, setViewRaw] = useState<View>(init.view);
  const [pool, setPoolRaw] = useState<string | null>(init.pool);

  const setBudget = useCallback((b: number) => setBudgetRaw(clamp(b, BUDGET_MIN, BUDGET_MAX)), []);
  const setMoveX = useCallback((n: number) => setMoveXRaw(clamp(Math.round(n), X_MIN, X_MAX)), []);
  const setAsset = useCallback((a: string) => setAssetRaw(validAsset(a)), []);

  // Latest values for the imperative nav callbacks.
  const ref = useRef({ budget, moveX, asset, view, pool });
  ref.current = { budget, moveX, asset, view, pool };

  // Single writer: reflect state → hash (replaceState, no history entry).
  useEffect(() => {
    try {
      window.history.replaceState(null, "", hashFor(budget, moveX, asset, view, pool));
    } catch {
      /* history unavailable — in-memory only */
    }
  }, [budget, moveX, asset, view, pool]);

  // Browser back/forward → re-sync everything from the hash.
  useEffect(() => {
    const onPop = () => {
      const h = readHash();
      setBudgetRaw(h.budget);
      setMoveXRaw(h.moveX);
      setAssetRaw(h.asset);
      setViewRaw(h.view);
      setPoolRaw(h.pool);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Navigate to a page: pushState so browser-back returns to the dashboard.
  const openPlan = useCallback(() => {
    const c = ref.current;
    if (c.view === "plan") return;
    try {
      window.history.pushState(null, "", hashFor(c.budget, c.moveX, c.asset, "plan", null));
    } catch {
      /* ignore */
    }
    setPoolRaw(null);
    setViewRaw("plan");
  }, []);

  const openPool = useCallback((key: string) => {
    const c = ref.current;
    try {
      window.history.pushState(null, "", hashFor(c.budget, c.moveX, c.asset, "pool", key));
    } catch {
      /* ignore */
    }
    setPoolRaw(key);
    setViewRaw("pool");
  }, []);

  const goDashboard = useCallback(() => {
    setViewRaw("dashboard");
    setPoolRaw(null);
  }, []);

  const shareLink = useCallback(() => {
    const c = ref.current;
    return `${window.location.origin}${window.location.pathname}${hashFor(c.budget, c.moveX, c.asset, c.view, c.pool)}`;
  }, []);

  return {
    budget,
    setBudget,
    moveX,
    setMoveX,
    asset,
    setAsset,
    view,
    pool,
    openPlan,
    openPool,
    closePlan: goDashboard,
    goDashboard,
    shareLink,
  };
}
