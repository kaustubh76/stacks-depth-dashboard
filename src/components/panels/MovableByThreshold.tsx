import type { DepthIndex } from "../../api/types";
import Card from "../ui/Card";
import { usd0 } from "../../lib/format";

const ORDER = ["0.005", "0.010", "0.020", "0.050"];
const LABELS: Record<string, string> = { "0.005": "≤0.5%", "0.010": "≤1.0%", "0.020": "≤2.0%", "0.050": "≤5.0%" };

/** Total capital the whole ecosystem absorbs within each slippage budget. */
export default function MovableByThreshold({ depth }: { depth: DepthIndex }) {
  const rows = ORDER.filter((k) => depth.by_threshold[k]).map((k) => ({ k, ...depth.by_threshold[k] }));
  const max = Math.max(...rows.map((r) => r.total_movable_usd), 1);
  return (
    <Card label="Capital movable by slippage budget" tier="supporting">
      <p className="mb-3 text-[12px] text-muted">whole ecosystem, summed across pools</p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-right font-mono text-[12px] text-sub">{LABELS[r.k]}</span>
            <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-panel2">
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${(r.total_movable_usd / max) * 100}%`, background: `${r.k === "0.020" ? "#38b2c4" : "#38b2c4cc"}` }}
              />
            </div>
            <span className="w-24 shrink-0 font-mono text-[13px] tabular-nums text-ink">{usd0(r.total_movable_usd)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-edge pt-2 font-mono text-[11px] text-muted">
        deepest single pool at ≤2%:{" "}
        <span className="text-sub">{depth.by_threshold["0.020"]?.deepest_pool}</span> ·{" "}
        {usd0(depth.by_threshold["0.020"]?.deepest_pool_usd)} · {depth.by_threshold["0.020"]?.pools_with_any_depth} pools
        carry any depth
      </div>
    </Card>
  );
}
