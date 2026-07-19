import type { DepthIndex, DepthLadder } from "../../api/types";
import { movableAtSlippage } from "../../lib/depth";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import { usd0, pct } from "../../lib/format";

const ORDER = ["0.005", "0.010", "0.020", "0.050"];
const LABELS: Record<string, string> = { "0.005": "≤0.5%", "0.010": "≤1.0%", "0.020": "≤2.0%", "0.050": "≤5.0%" };

/** Total capital the ecosystem absorbs within each slippage budget — the four measured
 * buckets plus a live bar tracking the budget slider (same math as the snapshot). */
export default function MovableByThreshold({
  depth,
  ladders,
  budget,
}: {
  depth: DepthIndex;
  ladders: DepthLadder[];
  budget: number;
}) {
  const preset = ORDER.filter((k) => depth.by_threshold[k]).map((k) => ({
    key: k,
    label: LABELS[k],
    value: depth.by_threshold[k].total_movable_usd,
    live: false,
  }));
  const liveVal = movableAtSlippage(ladders, budget);
  const rows = [{ key: "live", label: `≤${pct(budget, budget < 0.01 ? 2 : 1)}`, value: liveVal, live: true }, ...preset];
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <Card
      label="Capital movable by slippage budget"
      tier="supporting"
      right={<StatusPill tone="info" srText="top bar tracks the slider">live bar tracks slider</StatusPill>}
    >
      <p className="mb-3 text-[12px] text-muted">whole ecosystem, summed across pools</p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3">
            <span className={`w-16 shrink-0 text-right font-mono text-[12px] ${r.live ? "font-bold text-brand" : "text-sub"}`}>{r.label}</span>
            <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-panel2">
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-all duration-300 ease-out"
                style={{ width: `${(r.value / max) * 100}%`, background: r.live ? "#38b2c4" : "#38b2c4aa" }}
              />
            </div>
            <span className={`w-24 shrink-0 font-mono text-[13px] tabular-nums ${r.live ? "text-brand" : "text-ink"}`}>{usd0(r.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-edge pt-2 font-mono text-[11px] text-muted">
        deepest single pool at ≤2%: <span className="text-sub">{depth.by_threshold["0.020"]?.deepest_pool}</span> ·{" "}
        {usd0(depth.by_threshold["0.020"]?.deepest_pool_usd)} · {depth.by_threshold["0.020"]?.pools_with_any_depth} pools
        carry any depth
      </div>
    </Card>
  );
}
