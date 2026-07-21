import { useEffect, useMemo, useRef } from "react";

import type { DepthLadder } from "../../api/types";
import { ASSETS, X_MIN, X_MAX } from "../../hooks/useHashState";
import { planTrade } from "../../lib/depth";
import { FOCUS_PLANNER_EVENT } from "../../lib/cockpit";
import { pct, usd0 } from "../../lib/format";
import Card from "../ui/Card";
import { ChipButton, PrimaryButton } from "../ui/ChipButton";
import StatusPill from "../ui/StatusPill";

const QUICK = [1000, 10000, 25000, 50000, 100000];

const toSlider = (n: number) => (Math.log10(n) - Math.log10(X_MIN)) / (Math.log10(X_MAX) - Math.log10(X_MIN));
const fromSlider = (f: number) => Math.round(10 ** (Math.log10(X_MIN) + f * (Math.log10(X_MAX) - Math.log10(X_MIN))));

const PREVIEW: Record<string, { tone: "up" | "brand" | "warn" | "down"; label: string }> = {
  single: { tone: "up", label: "fits in one pool" },
  split: { tone: "brand", label: "splits across pools" },
  partial: { tone: "warn", label: "partial fill" },
  "no-fill": { tone: "down", label: "no fill at this budget" },
};

/**
 * The flagship task panel: pick an asset + size, hit "Plan this move" → opens the full Trade Plan
 * PAGE (deep-linked, browser-back friendly). A live one-line preview updates as you tune inputs,
 * so you know what you'll get before you open it. All routing is from the frozen snapshot ladders.
 */
export default function TradePlanner({
  ladders,
  budget,
  moveX,
  setMoveX,
  asset,
  setAsset,
  onOpenPlan,
}: {
  ladders: DepthLadder[];
  budget: number;
  moveX: number;
  setMoveX: (n: number) => void;
  asset: string;
  setAsset: (a: string) => void;
  /** Navigate to the full Trade Plan page. */
  onOpenPlan: () => void;
}) {
  const sizeRef = useRef<HTMLInputElement>(null);

  const poolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of ladders) counts[l.major_symbol] = (counts[l.major_symbol] ?? 0) + 1;
    return counts;
  }, [ladders]);

  // Live preview so the panel gives instant feedback before you open the page.
  const preview = useMemo(() => planTrade(ladders, asset, moveX, budget), [ladders, asset, moveX, budget]);
  const pv = PREVIEW[preview.verdict];

  // ⌘K "Plan a trade" → focus the size input (fires alongside opening the page).
  useEffect(() => {
    const onFocus = () => sizeRef.current?.focus();
    window.addEventListener(FOCUS_PLANNER_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_PLANNER_EVENT, onFocus);
  }, []);

  return (
    <Card label="Trade planner" tier="hero" accent="#43b581">
      <p className="mb-3 text-[12px] leading-snug text-muted">
        Plan a real move: pick the asset, set the size, and open the full plan — best pool, expected slippage, the
        split when one pool can't absorb it, and the dollar cost. Computed from the frozen on-chain snapshot.
      </p>

      {/* Step 1 — asset */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">1 · asset</span>
        {ASSETS.map((a) => (
          <ChipButton key={a} size="md" active={asset === a} onClick={() => setAsset(a)} ariaLabel={`Plan a ${a} trade`}>
            {a} <span className="opacity-60">·{poolCounts[a] ?? 0}</span>
          </ChipButton>
        ))}
      </div>

      {/* Step 2 — size */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">2 · size</span>
        <div className="flex items-center rounded-sm border-3 border-[color:var(--thick-line)] bg-panel2 px-2 py-1">
          <span className="font-mono text-sm text-muted">$</span>
          <input
            ref={sizeRef}
            type="number"
            min={X_MIN}
            max={X_MAX}
            step={100}
            value={moveX}
            onChange={(e) => setMoveX(parseFloat(e.target.value) || X_MIN)}
            aria-label="Trade size to plan, in USD"
            className="w-28 bg-transparent px-1 font-display text-lg font-bold tabular-nums text-ink outline-none"
          />
        </div>
        {QUICK.map((q) => (
          <ChipButton key={q} active={moveX === q} onClick={() => setMoveX(q)}>
            {usd0(q)}
          </ChipButton>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={toSlider(moveX)}
        onChange={(e) => setMoveX(fromSlider(parseFloat(e.target.value)))}
        aria-label="Trade size to plan"
        className="mt-3 w-full accent-brand"
      />

      {/* Step 3 — open the plan */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PrimaryButton onClick={onOpenPlan} ariaLabel="Open the full trade plan">
          Plan this move →
        </PrimaryButton>
        <span className="flex items-center gap-2 font-mono text-[11px] text-muted">
          <StatusPill tone={pv.tone} srText={pv.label}>
            {pv.label}
          </StatusPill>
          {usd0(moveX)} of {asset} at ≤{pct(budget, 2)}
        </span>
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted">opens a full, shareable plan page →</p>
    </Card>
  );
}
