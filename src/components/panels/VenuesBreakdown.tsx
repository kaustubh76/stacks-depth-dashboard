import { useMemo, useState } from "react";

import type { Summary, VenueName, Venue } from "../../api/types";
import Card from "../ui/Card";
import { usd0, int } from "../../lib/format";

const NAMES: VenueName[] = ["bitflow", "alex", "velar"];
const PRETTY: Record<VenueName, string> = { bitflow: "Bitflow", alex: "ALEX", velar: "Velar" };

type Col = { key: keyof Venue | "name"; label: string; fmt?: (v: number) => string };
const COLS: Col[] = [
  { key: "name", label: "Venue" },
  { key: "pools", label: "Pools", fmt: int },
  { key: "live", label: "Live", fmt: int },
  { key: "tvl_usd", label: "TVL", fmt: usd0 },
  { key: "volume_24h_usd_dex", label: "24h DEX vol", fmt: usd0 },
  { key: "swaps_24h", label: "Swaps 24h", fmt: int },
];

/** Per-venue market structure — sortable by any column. */
export default function VenuesBreakdown({ summary }: { summary: Summary }) {
  const [sort, setSort] = useState<{ key: Col["key"]; dir: 1 | -1 }>({ key: "tvl_usd", dir: -1 });

  const rows = useMemo(() => {
    const base = NAMES.map((n) => ({ n, v: summary.venues[n] })).filter((r) => r.v);
    return base.sort((a, b) => {
      if (sort.key === "name") return PRETTY[a.n].localeCompare(PRETTY[b.n]) * sort.dir;
      return ((a.v[sort.key] as number) - (b.v[sort.key] as number)) * sort.dir;
    });
  }, [summary, sort]);

  const clickSort = (key: Col["key"]) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));
  const arrow = (key: Col["key"]) => (sort.key === key ? (sort.dir === -1 ? " ▾" : " ▴") : "");

  return (
    <Card label="Venues — pools, TVL, and real activity" tier="supporting">
      <p className="mb-3 text-[12px] text-muted">click any header to sort</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-edge text-left font-mono text-[11px] uppercase tracking-wide text-muted">
              {COLS.map((c, i) => (
                <th key={c.key} className={`py-1.5 ${i === 0 ? "pr-3 text-left" : "px-3 text-right"} font-semibold`}>
                  <button type="button" onClick={() => clickSort(c.key)} className="uppercase tracking-wide transition hover:text-brand focus:outline-none">
                    {c.label}
                    {arrow(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ n, v }) => (
              <tr key={n} className="border-b border-edge/50 transition-colors hover:bg-panel2/40">
                <td className="py-1.5 pr-3 font-display font-bold text-ink">{PRETTY[n]}</td>
                <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{int(v.pools)}</td>
                <td className="py-1.5 px-3 text-right font-mono tabular-nums" style={{ color: "#43b581" }}>{int(v.live)}</td>
                <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{usd0(v.tvl_usd)}</td>
                <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{usd0(v.volume_24h_usd_dex)}</td>
                <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{int(v.swaps_24h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-edge pt-2 text-[12px] leading-snug text-muted">
        Bitflow carries the only meaningful on-chain swap activity ({int(summary.venues.bitflow?.swaps_24h)} swaps);
        ALEX &amp; Velar list far more pools but almost none trade.
      </p>
    </Card>
  );
}
