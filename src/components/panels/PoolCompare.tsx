import { useMemo } from "react";

import type { DepthLadder } from "../../api/types";
import { maxNotionalAt, poolKey, slippageAt } from "../../lib/depth";
import type { PoolSelection } from "../../hooks/usePoolSelection";
import { flashSection, sectionId } from "../../lib/sections";
import { pct, usd0 } from "../../lib/format";
import Card from "../ui/Card";
import { ChipButton } from "../ui/ChipButton";
import CurveChart from "../ui/CurveChart";

const COLORS = ["#38b2c4", "#43b581", "#d9a23a"];

/**
 * Pit 2–3 pools against each other: overlaid slippage curves at the shared budget/size, and
 * a side-by-side stat grid with the best value per row highlighted. Fed from the Pool
 * browser's compare tray. All figures recomputed from the frozen snapshot ladders.
 */
export default function PoolCompare({
  ladders,
  budget,
  moveX,
  selection,
}: {
  ladders: DepthLadder[];
  budget: number;
  moveX: number;
  selection: PoolSelection;
}) {
  const selected = useMemo(
    () =>
      selection.compare
        .map((k) => ladders.find((l) => poolKey(l) === k))
        .filter((l): l is DepthLadder => l !== undefined),
    [selection.compare, ladders],
  );

  const stats = useMemo(
    () =>
      selected.map((l, i) => ({
        l,
        key: poolKey(l),
        color: COLORS[i % COLORS.length],
        maxAtBudget: maxNotionalAt(l.points, budget),
        slipAtX: slippageAt(l.points, moveX),
        feasible: moveX <= (l.points[l.points.length - 1]?.notional ?? 0),
      })),
    [selected, budget, moveX],
  );

  const bestMax = Math.max(...stats.map((s) => s.maxAtBudget), 0);
  const feasibleSlips = stats.filter((s) => s.feasible).map((s) => s.slipAtX);
  const bestSlip = feasibleSlips.length > 0 ? Math.min(...feasibleSlips) : null;
  const bestTvl = Math.max(...stats.map((s) => s.l.tvl_usd), 0);
  const bestDepth2 = Math.max(...stats.map((s) => s.l.depth_2pct_usd), 0);

  if (selected.length === 0) {
    return (
      <Card label="Pool compare" tier="detail">
        <div className="flex flex-wrap items-center gap-3 py-2">
          <p className="text-[13px] text-muted">
            Pick 2–3 pools in the browser (the <span className="font-mono">＋</span> button) to pit their slippage
            curves and depth against each other.
          </p>
          <ChipButton onClick={() => flashSection(sectionId("Pool browser"))} ariaLabel="Jump to the pool browser">
            open pool browser →
          </ChipButton>
        </div>
      </Card>
    );
  }

  return (
    <Card
      label={`Pool compare — ${selected.length} of 3`}
      tier="supporting"
      accent="#d9a23a"
      right={
        <ChipButton onClick={selection.clearCompare} ariaLabel="Clear all compared pools">
          clear all
        </ChipButton>
      }
    >
      <p className="mb-3 text-[12px] leading-snug text-muted">
        Overlaid on-chain slippage curves — lower and flatter is deeper. The dashed line is your budget; the vertical
        marker is your trade size. Best value per row in <span className="text-up">green</span>.
      </p>

      <CurveChart
        series={stats.map((s) => ({ key: s.key, label: s.l.symbol, color: s.color, points: s.l.points }))}
        budget={budget}
        moveX={moveX}
      />

      <div
        className={`mt-4 grid grid-cols-1 gap-3 ${stats.length >= 3 ? "sm:grid-cols-3" : stats.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}
        data-testid="compare-columns"
      >
        {stats.map((s) => (
          <div key={s.key} className="rounded-sm border border-edge bg-panel2/50 p-3" data-testid="compare-column">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-[3px] w-3 rounded-sm" style={{ background: s.color }} />
                <span className="font-display font-bold text-ink">{s.l.symbol}</span>
              </span>
              <button
                type="button"
                onClick={() => selection.removeCompare(s.key)}
                aria-label={`Remove ${s.l.symbol} from compare`}
                className="rounded-sm px-1 font-mono text-[12px] text-muted transition hover:text-down focus:outline-none focus-visible:ring-1 focus-visible:ring-brand/50"
              >
                ×
              </button>
            </div>
            <dl className="mt-2 flex flex-col gap-1 font-mono text-[12px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">venue · major</dt>
                <dd className="text-sub">{s.l.venue} · {s.l.major_symbol}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">TVL</dt>
                <dd className={`tabular-nums ${s.l.tvl_usd === bestTvl ? "font-bold text-up" : "text-sub"}`}>{usd0(s.l.tvl_usd)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">depth @ ≤2%</dt>
                <dd className={`tabular-nums ${s.l.depth_2pct_usd === bestDepth2 ? "font-bold text-up" : "text-sub"}`}>{usd0(s.l.depth_2pct_usd)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">max @ ≤{pct(budget, budget < 0.01 ? 2 : 1)}</dt>
                <dd className={`tabular-nums ${s.maxAtBudget === bestMax && bestMax > 0 ? "font-bold text-up" : "text-sub"}`}>{usd0(s.maxAtBudget)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">slip @ {usd0(moveX)}</dt>
                <dd className={`tabular-nums ${s.feasible && s.slipAtX === bestSlip ? "font-bold text-up" : s.feasible ? "text-sub" : "text-down"}`}>
                  {s.feasible ? pct(s.slipAtX, 2) : "no fill"}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}
