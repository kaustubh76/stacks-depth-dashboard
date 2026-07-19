import type { Summary, VenueName } from "../../api/types";
import Card from "../ui/Card";
import { usd0, int } from "../../lib/format";

const NAMES: VenueName[] = ["bitflow", "alex", "velar"];
const PRETTY: Record<VenueName, string> = { bitflow: "Bitflow", alex: "ALEX", velar: "Velar" };

/** Per-venue market structure — where the pools, TVL, and real swaps actually are. */
export default function VenuesBreakdown({ summary }: { summary: Summary }) {
  return (
    <Card label="Venues — pools, TVL, and real activity" tier="supporting">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-edge text-left font-mono text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3 font-semibold">Venue</th>
              <th className="py-1.5 px-3 text-right font-semibold">Pools</th>
              <th className="py-1.5 px-3 text-right font-semibold">Live</th>
              <th className="py-1.5 px-3 text-right font-semibold">TVL</th>
              <th className="py-1.5 px-3 text-right font-semibold">24h DEX vol</th>
              <th className="py-1.5 pl-3 text-right font-semibold">Swaps 24h</th>
            </tr>
          </thead>
          <tbody>
            {NAMES.map((n) => {
              const v = summary.venues[n];
              if (!v) return null;
              return (
                <tr key={n} className="border-b border-edge/50">
                  <td className="py-1.5 pr-3 font-display font-bold text-ink">{PRETTY[n]}</td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{int(v.pools)}</td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums" style={{ color: "#43b581" }}>
                    {int(v.live)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{usd0(v.tvl_usd)}</td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{usd0(v.volume_24h_usd_dex)}</td>
                  <td className="py-1.5 pl-3 text-right font-mono tabular-nums text-sub">{int(v.swaps_24h)}</td>
                </tr>
              );
            })}
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
