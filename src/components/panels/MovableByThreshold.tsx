import type { DepthIndex, DepthLadder } from "../../api/types";
import { movableAtSlippage, poolKey } from "../../lib/depth";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import AnimatedNumber from "../ui/AnimatedNumber";
import InfoTip from "../ui/Tooltip";
import { usd0, pct } from "../../lib/format";

const ORDER = ["0.005", "0.010", "0.020", "0.050"];
const LABELS: Record<string, string> = { "0.005": "≤0.5%", "0.010": "≤1.0%", "0.020": "≤2.0%", "0.050": "≤5.0%" };

/** Total capital the ecosystem absorbs within each slippage budget — the four measured
 * buckets plus a live bar tracking the budget slider (same math as the snapshot). */
export default function MovableByThreshold({
  depth,
  ladders,
  budget,
  setBudget,
  onOpenPool,
}: {
  depth: DepthIndex;
  ladders: DepthLadder[];
  budget: number;
  setBudget: (b: number) => void;
  onOpenPool: (key: string) => void;
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

  // Resolve the "deepest pool" label (venue:pool_id) to a full poolKey so it can deep-link to the
  // pool page — pick the deepest major side when a pool has two.
  const deepestId = depth.by_threshold["0.020"]?.deepest_pool ?? null;
  const deepestCand = deepestId ? ladders.filter((l) => `${l.venue}:${l.pool_id}` === deepestId) : [];
  const deepestKey = deepestCand.length
    ? poolKey(deepestCand.reduce((a, b) => (b.depth_2pct_usd > a.depth_2pct_usd ? b : a)))
    : null;

  return (
    <Card
      label={
        <>
          Capital movable by slippage budget
          <InfoTip
            title="movable"
            text="Total capital the ecosystem can absorb within a slippage budget — summed across every measured pool."
            className="ml-1"
          />
        </>
      }
      tier="supporting"
      right={<StatusPill tone="info" srText="top bar tracks the slider">live bar tracks slider</StatusPill>}
    >
      <p className="mb-3 text-[12px] text-muted">whole ecosystem, summed across pools · click a bar to set the budget</p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const isCurrent = !r.live && Math.abs(budget - parseFloat(r.key)) < 1e-6;
          const inner = (
            <>
              <span className={`w-16 shrink-0 text-right font-mono text-[12px] ${r.live ? "font-bold text-brand" : "text-sub"}`}>{r.label}</span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-panel2">
                <div
                  className="absolute inset-y-0 left-0 rounded-sm transition-all duration-300 ease-out"
                  style={{ width: `${(r.value / max) * 100}%`, background: r.live ? "#38b2c4" : "#38b2c4aa" }}
                />
              </div>
              <span className={`w-24 shrink-0 text-left font-mono text-[13px] tabular-nums ${r.live ? "text-brand" : "text-ink"}`}>
                {r.live ? <AnimatedNumber value={r.value} format={usd0} duration={0.4} /> : usd0(r.value)}
              </span>
            </>
          );
          if (r.live) {
            return (
              <div key={r.key} className="flex items-center gap-3">
                {inner}
              </div>
            );
          }
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setBudget(parseFloat(r.key))}
              aria-pressed={isCurrent}
              aria-label={`Set the slippage budget to ${r.label.replace("≤", "at most ")}`}
              title={`set budget to ${r.label}`}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-sm text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
                isCurrent ? "ring-1 ring-brand/50" : "hover:ring-1 hover:ring-brand/40"
              }`}
            >
              {inner}
            </button>
          );
        })}
      </div>
      <div className="mt-3 border-t border-edge pt-2 font-mono text-[11px] text-muted">
        deepest single pool at ≤2%:{" "}
        {deepestKey ? (
          <button
            type="button"
            onClick={() => onOpenPool(deepestKey)}
            className="text-sub underline decoration-dotted underline-offset-2 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            title="open this pool's page"
          >
            {depth.by_threshold["0.020"]?.deepest_pool} ↗
          </button>
        ) : (
          <span className="text-sub">{depth.by_threshold["0.020"]?.deepest_pool}</span>
        )}{" "}
        · {usd0(depth.by_threshold["0.020"]?.deepest_pool_usd)} · {depth.by_threshold["0.020"]?.pools_with_any_depth} pools
        carry any depth
      </div>
    </Card>
  );
}
