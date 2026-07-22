import { useMemo, useState } from "react";

import type { DepthLadder, Facts, Verdict } from "../../api/types";
import { byAssetAtSlippage, recomputeVerdict, viableBudgetThreshold } from "../../lib/depth";
import StatusPill from "../ui/StatusPill";
import AnimatedNumber from "../ui/AnimatedNumber";
import { ChipButton } from "../ui/ChipButton";
import ReasoningReveal, { TraceChip } from "../ui/ReasoningReveal";
import { usd0, pct } from "../../lib/format";

const TARGET_CHIPS = [25000, 50000, 100000, 250000];
const TARGET_STEP = 25000;
const TARGET_MIN = 10000;
const TARGET_MAX = 500000;
const ASSETS_MIN = 1;
const ASSETS_MAX = 6;

interface WhatIf {
  target: number;
  minAssets: number;
}

/**
 * The headline finding (snapshot @ ≤2%), with a coloured rail that tracks the slippage
 * budget AND a what-if row: change the deploy target or the required asset count and watch
 * the verdict flip. The official published finding text never changes — overrides are
 * always labelled `what-if`.
 */
export default function VerdictBanner({
  verdict,
  ladders,
  budget,
  facts,
  setBudget,
}: {
  verdict: Verdict;
  ladders: DepthLadder[];
  budget: number;
  facts: Facts;
  setBudget: (b: number) => void;
}) {
  const [whatIf, setWhatIf] = useState<WhatIf | null>(null);

  const officialTarget = verdict.thresholds.deploy_target_usd;
  const officialMinAssets = verdict.thresholds.min_independent_assets;
  const target = whatIf?.target ?? officialTarget;
  const minAssets = whatIf?.minAssets ?? officialMinAssets;

  const offSnapshot = Math.abs(budget - 0.02) > 1e-6;
  // Recompute whenever the budget left the snapshot OR thresholds are overridden — always
  // with a fresh thresholds object (never mutate the published verdict).
  const rv =
    offSnapshot || whatIf
      ? recomputeVerdict(ladders, budget, {
          min_asset_depth_2pct_usd: verdict.thresholds.min_asset_depth_2pct_usd,
          min_independent_assets: minAssets,
        })
      : null;

  const movable = rv ? rv.movable : verdict.movable_at_2pct_usd;
  const nTradeable = rv ? rv.nTradeable : verdict.n_tradeable_assets;
  const effectiveViable = rv ? rv.rotationViable : verdict.rotation_viable;
  const deployOk = whatIf || offSnapshot ? movable >= target : verdict.can_deploy_50k_at_2pct;
  const rail = effectiveViable ? "#43b581" : "#e0728a";

  // Real sources for the reasoning reveals (each claim carries its on-chain / vendor origin).
  const srcOf = (k: string): string => facts.claims.find((c) => c.key === k)?.source ?? "";

  // "What would it take?" — rank assets by movable at the CURRENT budget; the closest asset still
  // below the depth bar is the gap to a viable rotation. Recomputes live as the budget changes.
  const bar = verdict.thresholds.min_asset_depth_2pct_usd;
  const rankedAssets = useMemo(
    () => Object.entries(byAssetAtSlippage(ladders, budget)).sort((a, b) => b[1] - a[1]),
    [ladders, budget],
  );
  const clearing = rankedAssets.filter(([, v]) => v >= bar);
  const nextBelow = rankedAssets.find(([, v]) => v < bar) ?? null;
  // Independent of the current budget — scan once for the budget (if any ≤10%) that makes rotation viable.
  const viableBudget = useMemo(
    () => viableBudgetThreshold(ladders, { min_asset_depth_2pct_usd: bar, min_independent_assets: officialMinAssets }),
    [ladders, bar, officialMinAssets],
  );

  const setTarget = (t: number) =>
    setWhatIf({ target: Math.min(Math.max(t, TARGET_MIN), TARGET_MAX), minAssets });
  const setMinAssets = (n: number) =>
    setWhatIf({ target, minAssets: Math.min(Math.max(n, ASSETS_MIN), ASSETS_MAX) });

  return (
    <section className="glow-card relative mb-5 p-5 pl-6 transition-shadow duration-500" style={{ boxShadow: `6px 6px 0 0 ${rail}, var(--card-ambient)` }}>
      <span className="absolute inset-y-0 left-0 w-[6px] transition-colors duration-500" style={{ background: rail }} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusPill tone={effectiveViable ? "up" : "down"} dot srText={effectiveViable ? "rotation viable" : "rotation not viable"}>
          {effectiveViable ? "Tradeable" : "Not yet tradeable"}
        </StatusPill>
        <StatusPill tone={deployOk ? "up" : "warn"}>
          {deployOk ? `${usd0(target)} deployable @ ≤${pct(budget, budget < 0.01 ? 2 : 1)}` : `${usd0(target)} target unmet`}
        </StatusPill>
        {whatIf && (
          <StatusPill tone="info" srText="thresholds overridden below — not the published verdict">
            what-if
          </StatusPill>
        )}
        <span className="font-mono text-[12px] text-muted">
          {nTradeable}/{minAssets} assets clear the {usd0(target)} bar
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-sub">{verdict.finding}</p>

      {/* Reasoning layer — the real "why" and "what would it take", one click away (all sourced) */}
      <div className="mt-3 flex flex-col gap-2">
        <ReasoningReveal label="Why not viable?">
          <p className="mb-2">
            The finding turns on <b>diversity, not size</b>. A systematic rotation needs at least{" "}
            <b>{officialMinAssets} independent liquid assets</b>; only <b>{verdict.n_tradeable_assets}</b> clear the{" "}
            {usd0(verdict.thresholds.min_asset_depth_2pct_usd)} depth bar.
          </p>
          <ul className="space-y-1.5">
            <li className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-mono text-ink">
                {verdict.n_tradeable_assets}/{officialMinAssets} assets clear the bar
              </span>
              <span className="text-muted">— {verdict.tradeable_assets_at_2pct.join(", ") || "none"}</span>
              <span className="text-[10px] text-muted">· {srcOf("tradeable_assets_at_2pct")}</span>
              <TraceChip claimKey="tradeable_assets_at_2pct" />
            </li>
            <li className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-mono text-ink">{usd0(verdict.movable_at_2pct_usd)} total movable @≤2%</span>
              <span className="text-muted">· deepest single pool {usd0(verdict.deepest_single_pool_usd)}</span>
              <span className="text-[10px] text-muted">· {srcOf("depth_movable_at_2pct_usd")}</span>
              <TraceChip claimKey="depth_movable_at_2pct_usd" />
            </li>
          </ul>
          <p className="mt-2 text-muted">
            So although {usd0(verdict.movable_at_2pct_usd)} can move and the deepest pool alone clears{" "}
            {usd0(verdict.deepest_single_pool_usd)}, there's nothing to rotate <i>between</i> — two liquid assets isn't a
            portfolio. A momentum backtest agrees: it loses money at every realistic friction.
            <TraceChip claimKey="backtest_total_return_at_2pct" label="see backtest →" />
          </p>
        </ReasoningReveal>

        <ReasoningReveal label="What would it take?" icon="△">
          {clearing.length >= officialMinAssets ? (
            <p>
              ✓ At ≤{pct(budget, budget < 0.01 ? 2 : 1)}, <b>{clearing.length} assets</b> clear the {usd0(bar)} bar (
              {clearing.map(([a]) => a).join(", ")}) — enough for a {officialMinAssets}-asset rotation.
            </p>
          ) : nextBelow ? (
            <>
              <p className="mb-2">
                Rotation needs <b>{officialMinAssets}</b> liquid assets; <b>{clearing.length}</b> clear the {usd0(bar)}{" "}
                bar at ≤{pct(budget, budget < 0.01 ? 2 : 1)}. The closest candidate:
              </p>
              <div className="rounded-sm border border-edge bg-panel2/50 p-2.5 font-mono text-[12px]">
                <b className="text-ink">{nextBelow[0]}</b> is at {usd0(nextBelow[1])} — needs{" "}
                <b style={{ color: "#e0728a" }}>+{usd0(bar - nextBelow[1])}</b> more depth @≤
                {pct(budget, budget < 0.01 ? 2 : 1)} to become the next tradeable asset (#{clearing.length + 1}).
              </div>
              {officialMinAssets - clearing.length > 1 && (
                <p className="mt-2 text-muted">
                  …and {officialMinAssets - clearing.length - 1} more asset(s) beyond that.
                </p>
              )}
              <p className="mt-2 text-muted">Drag the slippage budget and this recomputes live.</p>
              <div className="mt-2 border-t border-edge/60 pt-2">
                {viableBudget !== null ? (
                  <span>
                    Or loosen the budget: rotation would clear at{" "}
                    <b className="text-ink">≤{pct(viableBudget, viableBudget < 0.01 ? 2 : 1)}</b> slippage.
                    <button
                      type="button"
                      onClick={() => setBudget(viableBudget)}
                      aria-label="Set the slippage budget to the level where rotation clears"
                      className="ml-1.5 rounded-sm border border-edge px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                      set budget →
                    </button>
                  </span>
                ) : (
                  <span>
                    Even at <b className="text-ink">≤10%</b> slippage, fewer than {officialMinAssets} assets clear the bar —
                    Stacks is structurally too thin to rotate at any realistic budget.
                  </span>
                )}
              </div>
            </>
          ) : (
            <p>No asset sits below the bar to solve for.</p>
          )}
        </ReasoningReveal>
      </div>

      {rv && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border border-cool/30 bg-cool/5 px-3 py-2">
          <StatusPill tone="info" srText="recomputed at your chosen budget and thresholds">
            at ≤{pct(budget, budget < 0.01 ? 2 : 1)}
          </StatusPill>
          <span className="font-mono text-[12px] text-sub">
            <AnimatedNumber value={rv.movable} format={usd0} duration={0.4} /> movable ·{" "}
            {rv.nTradeable}/{minAssets} tradeable ·{" "}
            <span style={{ color: rv.rotationViable ? "#43b581" : "#e0728a" }}>
              {rv.rotationViable ? "rotation viable" : "still not viable"}
            </span>
            {rv.tradeable.length > 0 && <span className="text-muted"> ({rv.tradeable.join(", ")})</span>}
          </span>
        </div>
      )}

      {/* What-if controls — poke the thresholds and watch the verdict react. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge/60 pt-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">what-if · deploy target</span>
        {TARGET_CHIPS.map((t) => (
          <ChipButton key={t} active={whatIf !== null && target === t} onClick={() => setTarget(t)} ariaLabel={`Set deploy target to ${usd0(t)}`}>
            {usd0(t)}
          </ChipButton>
        ))}
        <span className="flex items-center gap-1">
          <ChipButton onClick={() => setTarget(target - TARGET_STEP)} ariaLabel="Decrease deploy target by $25,000">−</ChipButton>
          <ChipButton onClick={() => setTarget(target + TARGET_STEP)} ariaLabel="Increase deploy target by $25,000">＋</ChipButton>
        </span>
        <span className="mx-1 h-4 w-px bg-edge" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">min assets</span>
        <span className="flex items-center gap-1">
          <ChipButton onClick={() => setMinAssets(minAssets - 1)} ariaLabel="Decrease minimum independent assets">−</ChipButton>
          <span className="font-mono text-[12px] font-bold tabular-nums text-ink" data-testid="min-assets">{minAssets}</span>
          <ChipButton onClick={() => setMinAssets(minAssets + 1)} ariaLabel="Increase minimum independent assets">＋</ChipButton>
        </span>
        {whatIf && (
          <ChipButton onClick={() => setWhatIf(null)} ariaLabel="Reset thresholds to the official published values" className="ml-auto">
            reset to official
          </ChipButton>
        )}
      </div>
    </section>
  );
}
