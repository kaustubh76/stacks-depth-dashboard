import { useMemo, useState } from "react";

import type { DepthLadder } from "../../api/types";
import { maxNotionalAt, poolKey } from "../../lib/depth";
import { COMPARE_CAP, type PoolSelection } from "../../hooks/usePoolSelection";
import { flashSection, sectionId } from "../../lib/sections";
import { pct, usd0 } from "../../lib/format";
import Card from "../ui/Card";
import { ChipButton } from "../ui/ChipButton";
import AnimatedNumber from "../ui/AnimatedNumber";
import { useToast } from "../ui/Toast";

const VENUES = ["velar", "bitflow", "alex"] as const;

type SortKey = "symbol" | "venue" | "tvl" | "depth2" | "maxAtBudget";

/**
 * Every measured ladder as a working table: filter by venue/asset, search pairs, sort by
 * what you can actually move at the current budget, and act on each row — isolate its curve
 * in the explorer or throw it into the compare tray. The "max @ budget" column recomputes
 * live as the budget slider moves.
 */
export default function PoolBrowser({
  ladders,
  budget,
  selection,
  onOpenPool,
  onDownloadCsv,
  onDownloadJson,
}: {
  ladders: DepthLadder[];
  budget: number;
  selection: PoolSelection;
  onOpenPool: (key: string) => void;
  onDownloadCsv: () => void;
  onDownloadJson: () => void;
}) {
  const { toast } = useToast();
  const [venues, setVenues] = useState<Set<string>>(() => new Set());
  const [assets, setAssets] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "maxAtBudget", dir: -1 });

  const assetNames = useMemo(() => [...new Set(ladders.map((l) => l.major_symbol))], [ladders]);
  const venueCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of ladders) m[l.venue] = (m[l.venue] ?? 0) + 1;
    return m;
  }, [ladders]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = ladders
      .map((l) => ({ l, key: poolKey(l), maxAtBudget: maxNotionalAt(l.points, budget) }))
      .filter(({ l }) => (venues.size === 0 || venues.has(l.venue)) && (assets.size === 0 || assets.has(l.major_symbol)))
      .filter(({ l }) => needle === "" || l.symbol.toLowerCase().includes(needle));
    const val = (r: (typeof base)[number]): string | number =>
      sort.key === "symbol" ? r.l.symbol : sort.key === "venue" ? r.l.venue : sort.key === "tvl" ? r.l.tvl_usd : sort.key === "depth2" ? r.l.depth_2pct_usd : r.maxAtBudget;
    return base.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sort.dir;
      return ((av as number) - (bv as number)) * sort.dir;
    });
  }, [ladders, budget, venues, assets, q, sort]);

  const toggleSet = (set: Set<string>, v: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  };

  const anyFilter = venues.size > 0 || assets.size > 0 || q.trim() !== "";

  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "symbol" || key === "venue" ? 1 : -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === -1 ? " ▾" : " ▴") : "");
  const Th = ({ k, children, right = true }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`py-1.5 ${right ? "px-3 text-right" : "pr-3 text-left"} font-semibold`}>
      <button type="button" onClick={() => clickSort(k)} className="uppercase tracking-wide transition hover:text-brand focus:outline-none">
        {children}
        {arrow(k)}
      </button>
    </th>
  );

  const onCompare = (key: string, symbol: string) => {
    const inTray = selection.compare.includes(key);
    if (!inTray && selection.compare.length >= COMPARE_CAP) {
      toast.warn(`Compare holds ${COMPARE_CAP} pools — remove one first`);
      return;
    }
    selection.toggleCompare(key);
    if (!inTray) toast.success(`${symbol} added to compare (${selection.compare.length + 1}/${COMPARE_CAP})`);
  };

  const trayLadders = selection.compare
    .map((k) => ladders.find((l) => poolKey(l) === k))
    .filter((l): l is DepthLadder => l !== undefined);

  return (
    <Card
      label={`Pool browser — all ${ladders.length} ladders`}
      tier="supporting"
      accent="#38b2c4"
      right={
        <span className="flex items-center gap-2">
          <ChipButton onClick={onDownloadCsv} title="download every pool at the current budget as CSV" ariaLabel="Download pool table as CSV">
            ⬇ csv
          </ChipButton>
          <ChipButton onClick={onDownloadJson} title="download the current scenario (budget, size, plan, verdict) as JSON" ariaLabel="Download current scenario as JSON">
            ⬇ json
          </ChipButton>
        </span>
      }
    >
      <p className="mb-3 text-[12px] leading-snug text-muted">
        Every measured pool-side, as a working table. The <span className="text-brand">max @ budget</span> column
        recomputes as you move the budget slider. Use <span className="font-mono">curve</span> to isolate a pool in the
        explorer, <span className="font-mono">＋</span> to compare.
      </p>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {VENUES.map((v) => (
          <ChipButton key={v} active={venues.has(v)} onClick={() => toggleSet(venues, v, setVenues)} ariaLabel={`Filter by ${v}`}>
            {v} <span className="opacity-60">·{venueCounts[v] ?? 0}</span>
          </ChipButton>
        ))}
        <span className="mx-1 h-4 w-px bg-edge" aria-hidden />
        {assetNames.map((a) => (
          <ChipButton key={a} active={assets.has(a)} onClick={() => toggleSet(assets, a, setAssets)} ariaLabel={`Filter by ${a}`}>
            {a}
          </ChipButton>
        ))}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search pair…"
          aria-label="Search pools by pair symbol"
          className="min-w-[120px] rounded-sm border border-edge bg-panel2 px-2 py-0.5 font-mono text-[11px] text-ink outline-none transition placeholder:text-muted focus:border-brand"
        />
        {anyFilter && (
          <ChipButton
            onClick={() => {
              setVenues(new Set());
              setAssets(new Set());
              setQ("");
            }}
            ariaLabel="Clear all filters"
          >
            clear
          </ChipButton>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted" data-testid="pool-count">
          {rows.length} / {ladders.length}
        </span>
      </div>

      {/* Compare tray */}
      {trayLadders.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-sm border border-brand/40 bg-brand/5 px-2 py-1.5" data-testid="compare-tray">
          <span className="font-mono text-[10px] uppercase tracking-wider text-brand">compare</span>
          {trayLadders.map((l) => (
            <span key={poolKey(l)} className="flex items-center gap-1 rounded-sm border border-edge bg-panel px-1.5 py-0.5 font-mono text-[11px] text-sub">
              {l.symbol}
              <button
                type="button"
                onClick={() => selection.removeCompare(poolKey(l))}
                aria-label={`Remove ${l.symbol} from compare`}
                className="text-muted transition hover:text-down focus:outline-none focus-visible:ring-1 focus-visible:ring-brand/50"
              >
                ×
              </button>
            </span>
          ))}
          <ChipButton onClick={selection.clearCompare} ariaLabel="Clear the compare tray">
            clear all
          </ChipButton>
          <ChipButton
            active
            onClick={() => flashSection(sectionId("Pool compare"))}
            ariaLabel="Jump to the pool compare panel"
            className="ml-auto"
          >
            view compare →
          </ChipButton>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-edge text-left font-mono text-[11px] uppercase tracking-wide text-muted">
                <Th k="symbol" right={false}>Pool</Th>
                <Th k="venue" right={false}>Venue</Th>
                <th className="py-1.5 pr-3 text-left font-semibold uppercase tracking-wide">Major</th>
                <Th k="tvl">TVL</Th>
                <Th k="depth2">Depth@2%</Th>
                <th className="py-1.5 px-3 text-right font-semibold">
                  <button type="button" onClick={() => clickSort("maxAtBudget")} className="uppercase tracking-wide text-brand transition hover:opacity-80 focus:outline-none">
                    Max @ ≤{pct(budget, budget < 0.01 ? 2 : 1)}{arrow("maxAtBudget")}
                  </button>
                </th>
                <th className="py-1.5 pl-3 text-right font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ l, key, maxAtBudget }) => {
                const inTray = selection.compare.includes(key);
                const isFocused = selection.focusKey === key;
                return (
                  <tr key={key} className={`border-b border-edge/50 transition-colors hover:bg-panel2/40 ${isFocused ? "bg-brand/5" : ""}`}>
                    <td className="py-1.5 pr-3">
                      <button
                        type="button"
                        onClick={() => onOpenPool(key)}
                        className="font-display font-bold text-ink transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                        title={`Open ${l.symbol} pool page`}
                        aria-label={`Open ${l.symbol} pool detail page`}
                      >
                        {l.symbol} <span className="font-mono text-[10px] text-muted">↗</span>
                      </button>
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-[11px] text-sub">{l.venue}</td>
                    <td className="py-1.5 pr-3 font-mono text-[11px] text-muted">{l.major_symbol}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{usd0(l.tvl_usd)}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{usd0(l.depth_2pct_usd)}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums font-bold text-brand">
                      <AnimatedNumber value={maxAtBudget} format={usd0} duration={0.4} />
                    </td>
                    <td className="py-1.5 pl-3 text-right">
                      <span className="flex items-center justify-end gap-1.5">
                        <ChipButton
                          active={isFocused}
                          onClick={() => {
                            selection.setFocus(isFocused ? null : key);
                            if (!isFocused) flashSection(sectionId("Slippage explorer"));
                          }}
                          title="isolate this pool's curve in the explorer"
                          ariaLabel={`${isFocused ? "Unfocus" : "Focus"} ${l.symbol} in the slippage explorer`}
                        >
                          curve
                        </ChipButton>
                        <ChipButton
                          active={inTray}
                          onClick={() => onCompare(key, l.symbol)}
                          title={inTray ? "remove from compare" : "add to compare"}
                          ariaLabel={`${inTray ? "Remove" : "Add"} ${l.symbol} ${inTray ? "from" : "to"} compare`}
                        >
                          {inTray ? "✓" : "＋"}
                        </ChipButton>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
