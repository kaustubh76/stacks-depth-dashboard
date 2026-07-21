import type { Summary, Verdict } from "../../api/types";
import CountUp from "../ui/CountUp";
import { flashSection, sectionId } from "../../lib/sections";
import { usd0, int } from "../../lib/format";

interface Tile {
  label: string;
  value: number;
  format: (n: number) => string;
  plain: string;
  color?: string;
  glow?: boolean;
  /** Panel label this tile jumps to on click. */
  target: string;
}

/** Context stats for the ecosystem (NOT the answer — that's the verdict). Each tile jumps to the
 * section with the full story. The movable + tradeable figures live in the verdict/budget control,
 * so they're intentionally not repeated here. */
export default function HeadlineTiles({ summary }: { summary: Summary; verdict?: Verdict }) {
  const tiles: Tile[] = [
    { label: "Pools tracked", value: summary.pools_total, format: int, plain: "ALEX · Velar · Bitflow", target: "All pools" },
    { label: "Trading in 24h", value: summary.pools_live, format: int, plain: `${Math.round((summary.pools_live / summary.pools_total) * 100)}% of pools are live`, color: "#43b581", target: "All pools" },
    { label: "Total TVL", value: summary.tvl_usd_total, format: usd0, plain: "on-chain reserves", target: "All pools" },
    { label: "Clean 24h volume", value: summary.volume_24h_usd_clean, format: usd0, plain: "ex-flagged · see data quality", target: "The evidence" },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={() => flashSection(sectionId(t.target))}
          aria-label={`${t.label} — jump to ${t.target}`}
          title={`jump to ${t.target}`}
          className="glow-card group relative p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          <span className="card-label">{t.label}</span>
          <div
            className={`mt-1.5 font-display text-2xl font-bold leading-none tabular-nums ${t.glow ? "metric-glow" : ""}`}
            style={t.color ? { color: t.color } : undefined}
          >
            <CountUp value={t.value} format={t.format} />
          </div>
          <div className="mt-1.5 text-[12px] leading-snug text-sub">{t.plain}</div>
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1.5 right-2 font-mono text-[9px] uppercase tracking-wide text-brand opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            → {t.target}
          </span>
        </button>
      ))}
    </div>
  );
}
