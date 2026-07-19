import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import type { DepthLadder } from "../../api/types";
import { ASSETS, X_MIN, X_MAX } from "../../hooks/useHashState";
import { planTrade, type TradePlan } from "../../lib/depth";
import { FOCUS_PLANNER_EVENT } from "../../lib/cockpit";
import { pct, usd0 } from "../../lib/format";
import Card from "../ui/Card";
import { ChipButton, PrimaryButton } from "../ui/ChipButton";
import CopyButton from "../ui/CopyButton";
import StatusPill from "../ui/StatusPill";
import { useToast } from "../ui/Toast";

const QUICK = [1000, 10000, 25000, 50000, 100000];

// Log-scale slider mapping, same recipe as DepthCalculator.
const toSlider = (n: number) => (Math.log10(n) - Math.log10(X_MIN)) / (Math.log10(X_MAX) - Math.log10(X_MIN));
const fromSlider = (f: number) => Math.round(10 ** (Math.log10(X_MIN) + f * (Math.log10(X_MAX) - Math.log10(X_MIN))));

interface Committed {
  asset: string;
  size: number;
  budget: number;
  result: TradePlan;
}

/**
 * The flagship task panel: pick an asset, set a size, hit "Plan this move" — get the best
 * pool, the expected slippage, and how the trade splits when one pool can't absorb it.
 * All routing is computed from the frozen snapshot ladders (never live feeds); a committed
 * plan marks itself stale rather than silently mutating when the inputs move on.
 */
export default function TradePlanner({
  ladders,
  budget,
  moveX,
  setMoveX,
  asset,
  setAsset,
  planSummary,
}: {
  ladders: DepthLadder[];
  budget: number;
  moveX: number;
  setMoveX: (n: number) => void;
  asset: string;
  setAsset: (a: string) => void;
  /** Builds the copyable blurb for the CURRENT inputs (App owns the scenario export). */
  planSummary: () => string;
}) {
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const sizeRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<Committed | null>(null);

  const poolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of ladders) counts[l.major_symbol] = (counts[l.major_symbol] ?? 0) + 1;
    return counts;
  }, [ladders]);

  // ⌘K "Plan a trade" → focus the size input.
  useEffect(() => {
    const onFocus = () => sizeRef.current?.focus();
    window.addEventListener(FOCUS_PLANNER_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_PLANNER_EVENT, onFocus);
  }, []);

  const stale =
    plan !== null &&
    (plan.asset !== asset || plan.size !== moveX || Math.abs(plan.budget - budget) > 1e-9);

  const commit = () => {
    const result = planTrade(ladders, asset, moveX, budget);
    setPlan({ asset, size: moveX, budget, result });
    toast.success(`Plan ready — ${usd0(moveX)} of ${asset} at ≤${pct(budget, 2)}`);
  };

  const r = plan?.result;

  return (
    <Card label="Trade planner" tier="hero" accent="#43b581">
      <p className="mb-3 text-[12px] leading-snug text-muted">
        Plan a real move: pick the asset, set the size, and get the route — best pool, expected slippage, and the
        split when one pool can't absorb it. Computed from the frozen on-chain snapshot.
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

      {/* Step 3 — plan */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PrimaryButton onClick={commit} ariaLabel="Plan this move">
          Plan this move →
        </PrimaryButton>
        <span className="font-mono text-[11px] text-muted">
          {usd0(moveX)} of {asset} at ≤{pct(budget, 2)} slippage
        </span>
      </div>

      {/* Answer card */}
      <AnimatePresence initial={false}>
        {plan && r && (
          <motion.div
            key="answer"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mt-4 rounded-sm border-3 border-[color:var(--thick-line)] bg-panel2/60 p-4"
            data-testid="plan-answer"
          >
            <div className="flex flex-wrap items-center gap-2">
              {r.verdict === "single" && <StatusPill tone="up" srText="fits in one pool within budget">fits in one pool</StatusPill>}
              {r.verdict === "split" && <StatusPill tone="brand" srText="needs multiple pools">splits across {r.split?.legs.length} pools</StatusPill>}
              {r.verdict === "partial" && <StatusPill tone="warn" srText="only partially fillable">partial fill only</StatusPill>}
              {r.verdict === "no-fill" && <StatusPill tone="down" srText="not fillable at this budget">no fill at ≤{pct(plan.budget, 2)}</StatusPill>}
              {stale && <StatusPill tone="warn" srText="inputs changed since this plan was computed">inputs changed — re-plan</StatusPill>}
              <span className="ml-auto flex items-center gap-2">
                {stale && (
                  <ChipButton onClick={commit} ariaLabel="Re-plan with the current inputs">
                    re-plan
                  </ChipButton>
                )}
                <CopyButton text={planSummary()} label="copy plan" />
              </span>
            </div>

            {r.verdict === "single" && r.best && (
              <p className="mt-3 text-[14px] text-sub">
                Best route: <b className="font-display text-ink">{r.best.leg.venue} {r.best.leg.symbol}</b> — expected
                slippage <b className="font-mono tabular-nums text-up">{pct(r.best.leg.slippage, 2)}</b> on{" "}
                {usd0(plan.size)} of {plan.asset}.
              </p>
            )}

            {(r.verdict === "split" || r.verdict === "partial") && r.split && (
              <>
                <p className="mt-3 text-[13px] text-sub">
                  {r.best && (
                    <>
                      No single pool clears it (best is <b className="text-ink">{r.best.leg.venue} {r.best.leg.symbol}</b>{" "}
                      at {pct(r.best.leg.slippage, 2)}).{" "}
                    </>
                  )}
                  Splitting across the deepest pools at ≤{pct(plan.budget, 2)}:{" "}
                  <b className="font-mono tabular-nums text-ink">{usd0(r.split.filled)}</b> fillable at a blended{" "}
                  <b className="font-mono tabular-nums text-ink">{pct(r.split.avgSlippage, 2)}</b>
                  {r.split.unfilled > 0.5 && (
                    <>
                      {" "}— <b className="font-mono tabular-nums text-down">{usd0(r.split.unfilled)}</b> won't fit
                    </>
                  )}
                  .
                </p>
                <table className="mt-2 w-full text-left font-mono text-[11px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted">
                      <th className="py-1 pr-2 font-normal">pool</th>
                      <th className="py-1 pr-2 font-normal">venue</th>
                      <th className="py-1 pr-2 text-right font-normal">leg</th>
                      <th className="py-1 text-right font-normal">slippage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.split.legs.map((leg) => (
                      <tr key={leg.key} className="border-t border-edge/60 text-sub">
                        <td className="py-1 pr-2 text-ink">{leg.symbol}</td>
                        <td className="py-1 pr-2">{leg.venue}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{usd0(leg.notional)}</td>
                        <td className="py-1 text-right tabular-nums">{pct(leg.slippage, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {r.verdict === "no-fill" && (
              <p className="mt-3 text-[13px] text-sub">
                No {plan.asset} pool can absorb {usd0(plan.size)} within a {pct(plan.budget, 2)} budget — the snapshot
                ladders top out below this size. Try a smaller size or a wider budget.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
