import type { Verdict } from "../../api/types";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import { usd0 } from "../../lib/format";

const COLS = ["0.005", "0.010", "0.020", "0.050"];
const COL_LABEL: Record<string, string> = { "0.005": "≤0.5%", "0.010": "≤1%", "0.020": "≤2%", "0.050": "≤5%" };

/** Per-asset movable USD at each slippage bucket. One or two assets carry almost all of it. */
export default function AssetDepthTable({
  byAsset,
  verdict,
}: {
  byAsset: Record<string, Record<string, number>>;
  verdict: Verdict;
}) {
  const tradeable = new Set(verdict.tradeable_assets_at_2pct);
  const bar = verdict.thresholds.min_asset_depth_2pct_usd;
  const rows = Object.entries(byAsset).sort((a, b) => (b[1]["0.020"] ?? 0) - (a[1]["0.020"] ?? 0));

  return (
    <Card label="Movable at each slippage budget — by asset" tier="supporting">
      <p className="mb-3 text-[12px] text-muted">
        an asset is “tradeable” once it clears {usd0(bar)} of depth at ≤2%; only {verdict.n_tradeable_assets} do
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-edge text-left font-mono text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3 font-semibold">Asset</th>
              {COLS.map((c) => (
                <th key={c} className="py-1.5 px-3 text-right font-semibold">
                  {COL_LABEL[c]}
                </th>
              ))}
              <th className="py-1.5 pl-3 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([asset, buckets]) => {
              const isTradeable = tradeable.has(asset);
              return (
                <tr key={asset} className="border-b border-edge/50">
                  <td className="py-1.5 pr-3 font-display font-bold text-ink">{asset}</td>
                  {COLS.map((c) => (
                    <td
                      key={c}
                      className="py-1.5 px-3 text-right font-mono tabular-nums"
                      style={c === "0.020" ? { color: isTradeable ? "#43b581" : "#e0728a" } : { color: "rgb(var(--c-sub))" }}
                    >
                      {usd0(buckets[c])}
                    </td>
                  ))}
                  <td className="py-1.5 pl-3 text-right">
                    {isTradeable ? (
                      <StatusPill tone="up" srText="clears the depth bar">
                        clears
                      </StatusPill>
                    ) : (
                      <StatusPill tone="neutral" srText="below the depth bar">
                        thin
                      </StatusPill>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
