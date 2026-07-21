import { useMemo } from "react";

import type { DepthLadder } from "../api/types";
import type { LiveState } from "../hooks/useLiveData";
import type { PoolSelection } from "../hooks/usePoolSelection";
import { poolKey, maxNotionalAt, slippageAt } from "../lib/depth";
import { matchDrift, snapshotPools } from "../lib/live";
import { flashSection, sectionId } from "../lib/sections";
import { useTheme } from "../hooks/useTheme";
import { usd0, pct } from "../lib/format";
import CurveChart from "./ui/CurveChart";
import { ChipButton } from "./ui/ChipButton";
import CopyButton from "./ui/CopyButton";
import StatusPill from "./ui/StatusPill";
import AnimatedNumber from "./ui/AnimatedNumber";

/**
 * Pool detail PAGE (deep-linked via #v=pool&p=<key>) — reached by clicking any pool. Turns the
 * last dead-end into a real destination: the pool's slippage curve, depth ladder, snapshot-vs-live
 * liquidity, what-you-can-move at the current budget/size, and CTAs into the trade plan / compare.
 */
export default function PoolDetailPage({
  ladders,
  live,
  budget,
  moveX,
  setAsset,
  poolKeyStr,
  selection,
  onOpenPlan,
  onClose,
  shareLink,
  asOf,
}: {
  ladders: DepthLadder[];
  live: LiveState;
  budget: number;
  moveX: number;
  setAsset: (a: string) => void;
  poolKeyStr: string;
  selection: PoolSelection;
  onOpenPlan: () => void;
  onClose: () => void;
  shareLink: () => string;
  asOf: string;
}) {
  const { theme, toggle } = useTheme();
  const ladder = useMemo(() => ladders.find((l) => poolKey(l) === poolKeyStr) ?? null, [ladders, poolKeyStr]);

  const derived = useMemo(() => {
    if (!ladder) return null;
    const ranked = [...ladders].sort((a, b) => b.depth_2pct_usd - a.depth_2pct_usd);
    const rank = ranked.findIndex((l) => poolKey(l) === poolKeyStr) + 1;
    const drift = matchDrift(snapshotPools([ladder]), live.dexPairs, 0).rows[0] ?? null;
    return {
      rank,
      total: ladders.length,
      depth2: maxNotionalAt(ladder.points, 0.02),
      movableAtBudget: maxNotionalAt(ladder.points, budget),
      slipAtSize: slippageAt(ladder.points, moveX),
      feasibleAtSize: moveX <= ladder.points[ladder.points.length - 1].notional,
      liveLiq: drift?.liveLiq ?? null,
      driftPct: drift?.driftPct ?? null,
    };
  }, [ladder, ladders, poolKeyStr, budget, moveX, live.dexPairs]);

  const inTray = ladder ? selection.compare.includes(poolKeyStr) : false;

  const Bar = (
    <div className="sticky top-0 z-40 w-full border-b-3 border-[color:var(--thick-line)] bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-edge px-2.5 py-1 font-mono text-[11px] text-sub transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          ← Dashboard
        </button>
        <span className="font-display text-xs font-bold uppercase tracking-wider text-brand">Pool</span>
        <div className="ml-auto flex items-center gap-1.5">
          <CopyButton text={shareLink()} label="share link" />
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
  );

  if (!ladder || !derived) {
    return (
      <div className="min-h-screen">
        {Bar}
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <div className="font-display text-2xl font-bold text-ink">Pool not found</div>
          <p className="mt-2 font-mono text-[12px] text-muted">This pool key isn't in the snapshot.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-sm border-3 border-[color:var(--thick-line)] bg-brand/10 px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-brand shadow-brut-sm transition hover:-translate-y-0.5 hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            ← Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const asset = ladder.major_symbol;

  return (
    <div className="min-h-screen">
      {Bar}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
          {ladder.venue} pool · {asset}
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{ladder.symbol}</h1>
        <p className="mt-2 font-mono text-[12px] text-muted">
          measured from the frozen {asOf} on-chain snapshot · #{derived.rank} of {derived.total} pools by depth @≤2%
        </p>

        {/* Stat tiles */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="glow-card p-4">
            <div className="card-label">Snapshot TVL</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{usd0(ladder.tvl_usd)}</div>
          </div>
          <div className="glow-card p-4">
            <div className="card-label">Depth @≤2%</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-brand metric-glow">{usd0(derived.depth2)}</div>
          </div>
          <div className="glow-card p-4">
            <div className="card-label">Movable @≤{pct(budget, budget < 0.01 ? 2 : 1)}</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-ink">
              <AnimatedNumber value={derived.movableAtBudget} format={usd0} duration={0.4} />
            </div>
          </div>
          <div className="glow-card p-4">
            <div className="card-label">Live liquidity</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-ink">
              {derived.liveLiq !== null ? <AnimatedNumber value={derived.liveLiq} format={usd0} duration={0.4} /> : "—"}
            </div>
            {derived.driftPct !== null && (
              <div className="mt-0.5 font-mono text-[10px]" style={{ color: Math.abs(derived.driftPct) < 0.05 ? "#8a8f9c" : derived.driftPct >= 0 ? "#43b581" : "#e0728a" }}>
                {derived.driftPct >= 0 ? "▲" : "▼"} {Math.abs(derived.driftPct).toFixed(2)}% vs snapshot
              </div>
            )}
          </div>
        </div>

        {/* Curve */}
        <div className="mt-6">
          <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-ink">Slippage curve</div>
          <CurveChart series={[{ key: poolKeyStr, label: ladder.symbol, color: "#38b2c4", points: ladder.points }]} budget={budget} moveX={moveX} />
          <p className="mt-2 font-mono text-[11px] text-sub">
            at {usd0(moveX)} this pool charges{" "}
            {derived.feasibleAtSize ? (
              <b style={{ color: derived.slipAtSize <= budget ? "#43b581" : "#e0728a" }}>{pct(derived.slipAtSize, 2)}</b>
            ) : (
              <b className="text-muted">no fill</b>
            )}{" "}
            · absorbs <b className="text-ink">{usd0(derived.movableAtBudget)}</b> within ≤{pct(budget, budget < 0.01 ? 2 : 1)}.
          </p>
        </div>

        {/* Depth ladder */}
        <div className="mt-6">
          <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-ink">Depth ladder</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-edge text-left font-mono text-[10.5px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-semibold">Trade size</th>
                  <th className="py-1.5 px-3 text-right font-semibold">Slippage</th>
                  <th className="py-1.5 pl-3 font-semibold">Within ≤{pct(budget, budget < 0.01 ? 2 : 1)}?</th>
                </tr>
              </thead>
              <tbody>
                {ladder.points.map((p) => {
                  const ok = p.slippage <= budget;
                  return (
                    <tr key={p.notional} className="border-b border-edge/50">
                      <td className="py-1.5 pr-3 font-mono tabular-nums text-sub">{usd0(p.notional)}</td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums" style={{ color: ok ? "#43b581" : "#e0728a" }}>
                        {pct(p.slippage, 2)}
                      </td>
                      <td className="py-1.5 pl-3">
                        {ok ? (
                          <StatusPill tone="up" srText="within budget">✓</StatusPill>
                        ) : (
                          <StatusPill tone="neutral" srText="over budget">over</StatusPill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-edge pt-5">
          <button
            type="button"
            onClick={() => {
              setAsset(asset);
              onOpenPlan();
            }}
            className="rounded-sm border-3 border-[color:var(--thick-line)] bg-brand/10 px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-brand shadow-brut-sm transition hover:-translate-y-0.5 hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            Plan a trade in {asset} →
          </button>
          <ChipButton
            active={inTray}
            onClick={() => selection.toggleCompare(poolKeyStr)}
            ariaLabel={inTray ? "Remove from compare" : "Add to compare"}
          >
            {inTray ? "in compare ✓" : "add to compare"}
          </ChipButton>
          <ChipButton
            onClick={() => {
              selection.setFocus(poolKeyStr);
              onClose();
              window.setTimeout(() => flashSection(sectionId("Slippage explorer")), 80);
            }}
            ariaLabel="Focus this pool in the slippage explorer"
          >
            focus in explorer
          </ChipButton>
          <span className="ml-auto font-mono text-[11px] text-muted">deep-linked — copy the share link</span>
        </div>
      </div>
    </div>
  );
}
