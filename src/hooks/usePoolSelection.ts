import { useCallback, useState } from "react";

// Cross-panel pool selection, owned by App and props-drilled (same convention as
// useScenario). Keys are the canonical `poolKey` triples from lib/depth. Session-only —
// deliberately not in the URL hash.

export const COMPARE_CAP = 3;

export interface PoolSelection {
  /** Pool isolated in the SlippageExplorer, or null. */
  focusKey: string | null;
  setFocus: (k: string | null) => void;
  /** 0..COMPARE_CAP poolKeys in insertion order. */
  compare: string[];
  /** Add (silently capped at COMPARE_CAP — callers toast on a full tray) or remove. */
  toggleCompare: (k: string) => void;
  removeCompare: (k: string) => void;
  clearCompare: () => void;
}

export function usePoolSelection(): PoolSelection {
  const [focusKey, setFocus] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

  const toggleCompare = useCallback((k: string) => {
    setCompare((cur) => {
      if (cur.includes(k)) return cur.filter((x) => x !== k);
      if (cur.length >= COMPARE_CAP) return cur;
      return [...cur, k];
    });
  }, []);

  const removeCompare = useCallback((k: string) => {
    setCompare((cur) => cur.filter((x) => x !== k));
  }, []);

  const clearCompare = useCallback(() => setCompare([]), []);

  return { focusKey, setFocus, compare, toggleCompare, removeCompare, clearCompare };
}
