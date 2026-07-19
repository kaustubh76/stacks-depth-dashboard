import type { DepthLadder, Verdict } from "../../api/types";
import { recomputeVerdict } from "../../lib/depth";
import { BUDGET_MIN, BUDGET_MAX } from "../../hooks/useHashState";
import StatusPill from "../ui/StatusPill";
import { usd0, pct } from "../../lib/format";

const PRESETS = [0.005, 0.01, 0.02, 0.05];

/**
 * The slippage-budget control. A live slider (+ preset chips) that recomputes total movable
 * capital, the tradeable-asset count, and the verdict via the same math as the published
 * snapshot. Sticky at the top of the interactive section so the whole page reacts to it.
 */
export default function SlippageBudget({
  ladders,
  thresholds,
  budget,
  setBudget,
}: {
  ladders: DepthLadder[];
  thresholds: Verdict["thresholds"];
  budget: number;
  setBudget: (b: number) => void;
}) {
  const v = recomputeVerdict(ladders, budget, thresholds);
  const atSnapshot = Math.abs(budget - 0.02) < 1e-6;

  return (
    <div className="glow-card mb-4 p-4" id="budget-control">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="card-label">Slippage budget</span>
          <span className="font-display text-2xl font-bold tabular-nums text-brand metric-glow">≤{pct(budget, budget < 0.01 ? 2 : 1)}</span>
          {!atSnapshot && (
            <StatusPill tone="info" srText="recomputed at your chosen budget">
              recomputed
            </StatusPill>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setBudget(p)}
              className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
                Math.abs(budget - p) < 1e-6 ? "border-brand bg-brand/10 text-brand" : "border-edge text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {pct(p, p < 0.01 ? 1 : 0)}
            </button>
          ))}
        </div>
      </div>

      <input
        type="range"
        min={BUDGET_MIN}
        max={BUDGET_MAX}
        step={0.0005}
        value={budget}
        onChange={(e) => setBudget(parseFloat(e.target.value))}
        aria-label="Slippage budget"
        className="mt-3 w-full accent-brand"
      />

      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-edge pt-3">
        <div>
          <div className="card-label">Movable</div>
          <div className="font-display text-xl font-bold tabular-nums text-brand">{usd0(v.movable)}</div>
        </div>
        <div>
          <div className="card-label">Tradeable assets</div>
          <div className="font-display text-xl font-bold tabular-nums" style={{ color: v.rotationViable ? "#43b581" : "#d9a23a" }}>
            {v.nTradeable}
            <span className="text-sm text-muted"> / {thresholds.min_independent_assets}</span>
          </div>
        </div>
        <div>
          <div className="card-label">Rotation</div>
          <div className="mt-1">
            <StatusPill tone={v.rotationViable ? "up" : "down"} dot srText={v.rotationViable ? "viable" : "not viable"}>
              {v.rotationViable ? "viable" : "not viable"}
            </StatusPill>
          </div>
        </div>
      </div>
    </div>
  );
}
