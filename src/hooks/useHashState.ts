import { useCallback, useEffect, useState } from "react";

// Shareable scenario state in the URL hash (#b=<budget>&x=<tradeSize>), so a tuned view is a
// copy-pasteable link. Read once on mount, written back on change via replaceState (no history spam).

export const BUDGET_MIN = 0.0025;
export const BUDGET_MAX = 0.05;
export const X_MIN = 100;
export const X_MAX = 100000;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function readHash(): { budget: number; moveX: number } {
  const def = { budget: 0.02, moveX: 10000 };
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const b = parseFloat(h.get("b") ?? "");
    const x = parseFloat(h.get("x") ?? "");
    return {
      budget: Number.isFinite(b) ? clamp(b, BUDGET_MIN, BUDGET_MAX) : def.budget,
      moveX: Number.isFinite(x) ? clamp(x, X_MIN, X_MAX) : def.moveX,
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
  shareLink: () => string;
}

export function useScenario(): Scenario {
  const init = readHash();
  const [budget, setBudgetRaw] = useState(init.budget);
  const [moveX, setMoveXRaw] = useState(init.moveX);

  const setBudget = useCallback((b: number) => setBudgetRaw(clamp(b, BUDGET_MIN, BUDGET_MAX)), []);
  const setMoveX = useCallback((n: number) => setMoveXRaw(clamp(Math.round(n), X_MIN, X_MAX)), []);

  useEffect(() => {
    const hash = `#b=${budget.toFixed(4)}&x=${Math.round(moveX)}`;
    try {
      window.history.replaceState(null, "", hash);
    } catch {
      /* history unavailable — in-memory only */
    }
  }, [budget, moveX]);

  const shareLink = useCallback(
    () => `${window.location.origin}${window.location.pathname}#b=${budget.toFixed(4)}&x=${Math.round(moveX)}`,
    [budget, moveX],
  );

  return { budget, setBudget, moveX, setMoveX, shareLink };
}
