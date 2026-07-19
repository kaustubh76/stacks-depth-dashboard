import type { Verdict } from "../../api/types";
import StatusPill from "../ui/StatusPill";
import { usd0 } from "../../lib/format";

/** The headline finding, with a coloured left rail keyed to viability. */
export default function VerdictBanner({ verdict }: { verdict: Verdict }) {
  const viable = verdict.rotation_viable;
  const rail = viable ? "#43b581" : "#e0728a";
  return (
    <section
      className="glow-card relative mb-5 p-5 pl-6"
      style={{ boxShadow: `6px 6px 0 0 ${rail}, var(--card-ambient)` }}
    >
      <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: rail }} />
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
    </section>
  );
}
