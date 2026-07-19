import type { DepthLadder, Verdict } from "../../api/types";
import { recomputeVerdict } from "../../lib/depth";
import StatusPill from "../ui/StatusPill";
import AnimatedNumber from "../ui/AnimatedNumber";
import { usd0, pct } from "../../lib/format";

/** The headline finding (snapshot @ ≤2%), with a coloured rail + a live recompute row that
 * tracks the slippage-budget slider when it moves off 2%. */
export default function VerdictBanner({
  verdict,
  ladders,
  budget,
}: {
  verdict: Verdict;
  ladders: DepthLadder[];
  budget: number;
}) {
  const viable = verdict.rotation_viable;
  const offSnapshot = Math.abs(budget - 0.02) > 1e-6;
  const rv = offSnapshot ? recomputeVerdict(ladders, budget, verdict.thresholds) : null;
  const effectiveViable = rv ? rv.rotationViable : viable; // rail tracks the current budget
  const rail = effectiveViable ? "#43b581" : "#e0728a";

  return (
    <section className="glow-card relative mb-5 p-5 pl-6 transition-shadow duration-500" style={{ boxShadow: `6px 6px 0 0 ${rail}, var(--card-ambient)` }}>
      <span className="absolute inset-y-0 left-0 w-[6px] transition-colors duration-500" style={{ background: rail }} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusPill tone={viable ? "up" : "down"} dot srText={viable ? "rotation viable" : "rotation not viable"}>
          {viable ? "Tradeable" : "Not yet tradeable"}
        </StatusPill>
        <StatusPill tone={verdict.can_deploy_50k_at_2pct ? "up" : "warn"}>
          {verdict.can_deploy_50k_at_2pct ? "$50k deployable @ ≤2%" : "$50k target unmet"}
        </StatusPill>
        <span className="font-mono text-[12px] text-muted">
          {usd0(verdict.movable_at_2pct_usd)} movable · deepest pool {usd0(verdict.deepest_single_pool_usd)} ·{" "}
          {verdict.n_tradeable_assets}/{verdict.thresholds.min_independent_assets} assets clear the bar
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-sub">{verdict.finding}</p>

      {rv && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border border-cool/30 bg-cool/5 px-3 py-2">
          <StatusPill tone="info" srText="recomputed at your chosen budget">
            at ≤{pct(budget, budget < 0.01 ? 2 : 1)}
          </StatusPill>
          <span className="font-mono text-[12px] text-sub">
            <AnimatedNumber value={rv.movable} format={usd0} duration={0.4} /> movable ·{" "}
            {rv.nTradeable}/{verdict.thresholds.min_independent_assets} tradeable ·{" "}
            <span style={{ color: rv.rotationViable ? "#43b581" : "#e0728a" }}>
              {rv.rotationViable ? "rotation viable" : "still not viable"}
            </span>
            {rv.tradeable.length > 0 && <span className="text-muted"> ({rv.tradeable.join(", ")})</span>}
          </span>
        </div>
      )}
    </section>
  );
}
