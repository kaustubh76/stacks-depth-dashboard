import { useMemo, useState } from "react";

import type { DepthLadder, Verdict } from "../../api/types";
import { byAssetAtSlippage } from "../../lib/depth";
import { downloadText, assetDepthCsv } from "../../lib/export";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import AnimatedNumber from "../ui/AnimatedNumber";
import { ChipButton } from "../ui/ChipButton";
import { usd0, pct } from "../../lib/format";

const COLS = ["0.005", "0.010", "0.020", "0.050"] as const;
const COL_LABEL: Record<string, string> = { "0.005": "≤0.5%", "0.010": "≤1%", "0.020": "≤2%", "0.050": "≤5%" };

type SortKey = "asset" | "live" | (typeof COLS)[number];

/** Per-asset movable USD at each budget, sortable, with a live column tracking the slider. */
export default function AssetDepthTable({
  byAsset,
  verdict,
  ladders,
  budget,
  onPlanAsset,
}: {
  byAsset: Record<string, Record<string, number>>;
  verdict: Verdict;
  ladders: DepthLadder[];
  budget: number;
  onPlanAsset: (asset: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "0.020", dir: -1 });
  const bar = verdict.thresholds.min_asset_depth_2pct_usd;
  const live = byAssetAtSlippage(ladders, budget);

  const rows = useMemo(() => {
    const base = Object.entries(byAsset).map(([asset, buckets]) => ({ asset, buckets, live: live[asset] ?? 0 }));
    const val = (r: (typeof base)[number]) => (sort.key === "asset" ? r.asset : sort.key === "live" ? r.live : r.buckets[sort.key] ?? 0);
    return base.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sort.dir;
      return ((av as number) - (bv as number)) * sort.dir;
    });
  }, [byAsset, live, sort]);

  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "asset" ? 1 : -1 }));

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === -1 ? " ▾" : " ▴") : "");
  const Th = ({ k, children, right = true }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`py-1.5 ${right ? "px-3 text-right" : "pr-3 text-left"} font-semibold`}>
      <button type="button" onClick={() => clickSort(k)} className="uppercase tracking-wide transition hover:text-brand focus:outline-none">
        {children}
        {arrow(k)}
      </button>
    </th>
  );

  return (
    <Card
      label="Movable at each budget — by asset"
      tier="supporting"
      right={
        <ChipButton
          onClick={() =>
            downloadText(`stacks-asset-depth-at-${(budget * 100).toFixed(2)}pct.csv`, "text/csv", assetDepthCsv(byAsset, live, budget))
          }
          title="download per-asset movable at each budget as CSV"
          ariaLabel="Download asset depth table as CSV"
        >
          ⬇ csv
        </ChipButton>
      }
    >
      <p className="mb-3 text-[12px] text-muted">
        click any header to sort · the <span className="text-brand">live column</span> tracks the slider (≤{pct(budget, budget < 0.01 ? 2 : 1)})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-edge text-left font-mono text-[11px] uppercase tracking-wide text-muted">
              <Th k="asset" right={false}>Asset</Th>
              {COLS.map((c) => (
                <Th key={c} k={c}>{COL_LABEL[c]}</Th>
              ))}
              <th className="py-1.5 px-3 text-right font-semibold">
                <button type="button" onClick={() => clickSort("live")} className="uppercase tracking-wide text-brand transition hover:opacity-80 focus:outline-none">
                  ≤{pct(budget, budget < 0.01 ? 2 : 1)}{arrow("live")}
                </button>
              </th>
              <th className="py-1.5 pl-3 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const clears = r.live >= bar;
              return (
                <tr key={r.asset} className="border-b border-edge/50 transition-colors hover:bg-panel2/40">
                  <td className="py-1.5 pr-3 font-display font-bold text-ink">
                    <button
                      type="button"
                      onClick={() => onPlanAsset(r.asset)}
                      title={`plan a ${r.asset} trade`}
                      aria-label={`Plan a ${r.asset} trade`}
                      className="transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                      {r.asset} →
                    </button>
                  </td>
                  {COLS.map((c) => (
                    <td key={c} className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{usd0(r.buckets[c])}</td>
                  ))}
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums font-bold transition-colors" style={{ color: clears ? "#43b581" : "#e0728a" }}>
                    <AnimatedNumber value={r.live} format={usd0} duration={0.4} />
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    <StatusPill tone={clears ? "up" : "neutral"} srText={clears ? "clears the depth bar" : "below the depth bar"}>
                      {clears ? "clears" : "thin"}
                    </StatusPill>
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
