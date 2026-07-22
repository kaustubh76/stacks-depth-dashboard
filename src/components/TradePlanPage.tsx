import { useMemo } from "react";

import type { DepthLadder } from "../api/types";
import { planTrade, realizedForNotional } from "../lib/depth";
import { ASSETS, BUDGET_MIN, BUDGET_MAX, X_MIN, X_MAX } from "../hooks/useHashState";
import { useTheme } from "../hooks/useTheme";
import { usd0, pct } from "../lib/format";
import { UP, DOWN, MUTED } from "../lib/colors";
import { ChipButton } from "./ui/ChipButton";
import CopyButton from "./ui/CopyButton";
import StatusPill from "./ui/StatusPill";
import AnimatedNumber from "./ui/AnimatedNumber";
import SkipLink from "./ui/SkipLink";

const BUDGET_PRESETS = [0.005, 0.01, 0.02, 0.05];
const QUICK = [1000, 10000, 25000, 50000, 100000];
const LEG_COLORS = ["#38b2c4", "#43b581", "#d9a23a", "#8b9dff", "#e0728a", "#3861fb"];

const toSlider = (n: number) => (Math.log10(n) - Math.log10(X_MIN)) / (Math.log10(X_MAX) - Math.log10(X_MIN));
const fromSlider = (f: number) => Math.round(10 ** (Math.log10(X_MIN) + f * (Math.log10(X_MAX) - Math.log10(X_MIN))));

const VERDICT: Record<string, { pill: "up" | "brand" | "warn" | "down"; label: string }> = {
  single: { pill: "up", label: "Fits in one pool" },
  split: { pill: "brand", label: "Splits across pools" },
  partial: { pill: "warn", label: "Partial fill only" },
  "no-fill": { pill: "down", label: "No fill at this budget" },
};

/**
 * The Trade Plan PAGE — a real destination (deep-linkable via #v=plan) rather than a popup.
 * Reads the current scenario, routes it with `planTrade` over the frozen snapshot, and lays out
 * the full result: verdict, route/split breakdown with dollar amounts, expected slippage cost,
 * and cheapest-asset alternatives. Inputs are editable here, so it doubles as a workspace.
 */
export default function TradePlanPage({
  ladders,
  budget,
  setBudget,
  moveX,
  setMoveX,
  asset,
  setAsset,
  onClose,
  planSummary,
  shareLink,
  onDownloadJson,
  asOf,
}: {
  ladders: DepthLadder[];
  budget: number;
  setBudget: (b: number) => void;
  moveX: number;
  setMoveX: (n: number) => void;
  asset: string;
  setAsset: (a: string) => void;
  onClose: () => void;
  planSummary: () => string;
  shareLink: () => string;
  onDownloadJson: () => void;
  asOf: string;
}) {
  const { theme, toggle } = useTheme();
  const plan = useMemo(() => planTrade(ladders, asset, moveX, budget), [ladders, asset, moveX, budget]);
  const alts = useMemo(() => realizedForNotional(ladders, moveX), [ladders, moveX]);

  // Dollar cost of expected slippage + how much fills.
  const { filled, costUsd, blended } = useMemo(() => {
    if (plan.verdict === "single" && plan.best) {
      return { filled: moveX, costUsd: moveX * plan.best.leg.slippage, blended: plan.best.leg.slippage };
    }
    if (plan.split) {
      const cost = plan.split.legs.reduce((s, l) => s + l.notional * l.slippage, 0);
      return { filled: plan.split.filled, costUsd: cost, blended: plan.split.avgSlippage };
    }
    return { filled: 0, costUsd: 0, blended: 0 };
  }, [plan, moveX]);
  const keep = filled - costUsd;

  const v = VERDICT[plan.verdict];
  const legs = plan.split?.legs ?? (plan.best && plan.verdict === "single" ? [{ ...plan.best.leg }] : []);
  const unfilled = plan.split?.unfilled ?? (plan.verdict === "no-fill" ? moveX : 0);

  return (
    <div className="min-h-screen">
      <SkipLink />
      {/* Top bar */}
      <div className="sticky top-0 z-40 w-full border-b-3 border-[color:var(--thick-line)] bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-edge px-2.5 py-1 font-mono text-[11px] text-sub transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            ← Dashboard
          </button>
          <span className="font-display text-xs font-bold uppercase tracking-wider text-brand">Trade plan</span>
          <div className="ml-auto flex items-center gap-1.5">
            <CopyButton text={shareLink()} label="share link" />
            <CopyButton text={planSummary()} label="copy plan" />
            <button
              type="button"
              onClick={onDownloadJson}
              className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              ⬇ .json
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label="toggle theme"
              className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </div>
      </div>

      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-8 outline-none sm:px-6">
        {/* Scenario header */}
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Trade plan</div>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Move {usd0(moveX)} of {asset}
        </h1>
        <p className="mt-2 font-mono text-[12px] text-muted">
          routed from the frozen {asOf} on-chain snapshot · target ≤{pct(budget, budget < 0.01 ? 2 : 1)} slippage ·
          not a live quote
        </p>

        {/* Editable controls */}
        <div className="mt-4 flex flex-col gap-3 rounded-sm border-3 border-[color:var(--thick-line)] bg-panel2/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-12 font-mono text-[10px] uppercase tracking-wider text-muted">asset</span>
            {ASSETS.map((a) => (
              <ChipButton key={a} size="md" active={asset === a} onClick={() => setAsset(a)} ariaLabel={`Plan a ${a} trade`}>
                {a}
              </ChipButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-12 font-mono text-[10px] uppercase tracking-wider text-muted">size</span>
            <div className="flex items-center rounded-sm border-3 border-[color:var(--thick-line)] bg-panel2 px-2 py-1">
              <span className="font-mono text-sm text-muted">$</span>
              <input
                type="number"
                min={X_MIN}
                max={X_MAX}
                step={100}
                value={moveX}
                onChange={(e) => setMoveX(parseFloat(e.target.value) || X_MIN)}
                aria-label="Trade size in USD"
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
            aria-label="Trade size"
            className="w-full accent-brand"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-12 font-mono text-[10px] uppercase tracking-wider text-muted">budget</span>
            {BUDGET_PRESETS.map((p) => (
              <ChipButton key={p} active={Math.abs(budget - p) < 1e-6} onClick={() => setBudget(p)}>
                ≤{pct(p, p < 0.01 ? 1 : 0)}
              </ChipButton>
            ))}
            <input
              type="range"
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              step={0.0005}
              value={budget}
              onChange={(e) => setBudget(parseFloat(e.target.value))}
              aria-label="Slippage budget"
              className="ml-2 flex-1 accent-brand"
            />
          </div>
        </div>

        {/* Verdict hero */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <StatusPill tone={v.pill} dot srText={v.label}>
            {v.label}
          </StatusPill>
          <span className="font-display text-lg font-bold text-ink">
            {plan.verdict === "single" && plan.best && (
              <>Route through {plan.best.leg.venue} {plan.best.leg.symbol} at {pct(plan.best.leg.slippage, 2)}</>
            )}
            {(plan.verdict === "split" || plan.verdict === "partial") && plan.split && (
              <>{usd0(plan.split.filled)} fills across {plan.split.legs.length} pools at {pct(plan.split.avgSlippage, 2)} blended</>
            )}
            {plan.verdict === "no-fill" && <>No pool absorbs {usd0(moveX)} of {asset} within ≤{pct(budget, 2)}</>}
          </span>
        </div>

        {/* Split / route visual */}
        {legs.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex h-8 w-full overflow-hidden rounded-sm border border-edge bg-panel2">
              {legs.map((leg, i) => (
                <div
                  key={leg.key}
                  className="flex items-center justify-center text-[10px] font-bold text-black/70"
                  style={{ width: `${(leg.notional / moveX) * 100}%`, background: LEG_COLORS[i % LEG_COLORS.length] }}
                  title={`${leg.symbol} · ${usd0(leg.notional)} · ${pct(leg.slippage, 2)}`}
                >
                  {leg.notional / moveX > 0.08 ? usd0(leg.notional) : ""}
                </div>
              ))}
              {unfilled > 0.5 && (
                <div
                  className="flex items-center justify-center bg-edge text-[10px] text-sub"
                  style={{ width: `${(unfilled / moveX) * 100}%` }}
                  title={`unfilled ${usd0(unfilled)}`}
                >
                  {unfilled / moveX > 0.08 ? "unfilled" : ""}
                </div>
              )}
            </div>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-edge text-left font-mono text-[10.5px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-semibold">Pool</th>
                  <th className="py-1.5 px-3 font-semibold">Venue</th>
                  <th className="py-1.5 px-3 text-right font-semibold">Leg size</th>
                  <th className="py-1.5 px-3 text-right font-semibold">Slippage</th>
                  <th className="py-1.5 pl-3 text-right font-semibold">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((leg, i) => (
                  <tr key={leg.key} className="border-b border-edge/50">
                    <td className="py-1.5 pr-3">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: LEG_COLORS[i % LEG_COLORS.length] }} />
                      <span className="font-display font-bold text-ink">{leg.symbol}</span>
                    </td>
                    <td className="py-1.5 px-3 font-mono text-muted">{leg.venue}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{usd0(leg.notional)}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums" style={{ color: leg.slippage <= budget ? UP : DOWN }}>
                      {pct(leg.slippage, 2)}
                    </td>
                    <td className="py-1.5 pl-3 text-right font-mono tabular-nums text-sub">{usd0(leg.notional * leg.slippage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {plan.verdict === "no-fill" && (
          <div className="mt-4 rounded-sm border border-edge bg-panel2/50 p-4 text-[13px] text-sub">
            No {asset} pool can absorb {usd0(moveX)} within a ≤{pct(budget, 2)} budget — the snapshot ladders top out
            below this size. Try a smaller size or a wider budget:
            <div className="mt-2 flex flex-wrap gap-2">
              <ChipButton onClick={() => setMoveX(Math.max(X_MIN, Math.round(moveX / 2)))}>try {usd0(Math.max(X_MIN, Math.round(moveX / 2)))}</ChipButton>
              <ChipButton onClick={() => setBudget(Math.min(BUDGET_MAX, budget * 2))}>widen to ≤{pct(Math.min(BUDGET_MAX, budget * 2), 1)}</ChipButton>
            </div>
          </div>
        )}

        {/* Cost summary */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="glow-card p-4">
            <div className="card-label">Fills</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-brand">
              <AnimatedNumber value={filled} format={usd0} duration={0.4} />
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted">of {usd0(moveX)} requested</div>
          </div>
          <div className="glow-card p-4">
            <div className="card-label">Expected slippage cost</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums" style={{ color: DOWN }}>
              <AnimatedNumber value={costUsd} format={usd0} duration={0.4} />
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted">{pct(blended, 2)} blended</div>
          </div>
          <div className="glow-card p-4">
            <div className="card-label">You keep ~</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums" style={{ color: UP }}>
              <AnimatedNumber value={keep} format={usd0} duration={0.4} />
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted">after price impact</div>
          </div>
        </div>

        {/* Alternatives */}
        <div className="mt-6">
          <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-ink">
            Same size, other assets
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-edge text-left font-mono text-[10.5px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-semibold">Asset</th>
                  <th className="py-1.5 px-3 font-semibold">Best pool</th>
                  <th className="py-1.5 px-3 text-right font-semibold">Slippage @ {usd0(moveX)}</th>
                  <th className="py-1.5 pl-3 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {alts.map((a) => (
                  <tr key={a.asset} className={`border-b border-edge/50 transition-colors hover:bg-panel2/40 ${a.asset === asset ? "bg-brand/5" : ""}`}>
                    <td className="py-1.5 pr-3 font-display font-bold text-ink">{a.asset}</td>
                    <td className="py-1.5 px-3 font-mono text-muted">{a.bestPoolSymbol}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums" style={{ color: !a.feasible ? MUTED : a.slippage <= budget ? UP : DOWN }}>
                      {a.feasible ? pct(a.slippage, 2) : "no fill"}
                    </td>
                    <td className="py-1.5 pl-3 text-right">
                      {a.asset !== asset && (
                        <ChipButton onClick={() => setAsset(a.asset)} ariaLabel={`Plan ${a.asset} instead`}>
                          plan this →
                        </ChipButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-edge pt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border-3 border-[color:var(--thick-line)] bg-brand/10 px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-brand shadow-brut-sm transition hover:-translate-y-0.5 hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            ← Back to dashboard
          </button>
          <span className="font-mono text-[11px] text-muted">plan is deep-linked — copy the share link to send it</span>
        </div>
      </main>
    </div>
  );
}
