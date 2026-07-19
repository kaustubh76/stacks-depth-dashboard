import { useState } from "react";

import type { DepthLadder, Verdict } from "../../api/types";
import { recomputeVerdict } from "../../lib/depth";
import StatusPill from "../ui/StatusPill";
import AnimatedNumber from "../ui/AnimatedNumber";
import { ChipButton } from "../ui/ChipButton";
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
}: {
  verdict: Verdict;
  ladders: DepthLadder[];
  budget: number;
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
          <AnimatedNumber value={movable} format={usd0} duration={0.4} /> movable ·{" "}
          {nTradeable}/{minAssets} assets clear the bar
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-sub">{verdict.finding}</p>

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
