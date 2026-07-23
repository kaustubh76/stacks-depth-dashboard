import { useMemo } from "react";

import type { DepthLadder } from "../../api/types";
import type { LiveState } from "../../hooks/useLiveData";
import { matchDrift, snapshotPools } from "../../lib/live";
import { useNow } from "../../hooks/useNow";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import AnimatedNumber from "../ui/AnimatedNumber";
import { usd0, usdCompact, ago } from "../../lib/format";
import { UP, DOWN, MUTED } from "../../lib/colors";

function Drift({ pctVal }: { pctVal: number | null }) {
  if (pctVal === null || !Number.isFinite(pctVal)) return <span className="text-muted">—</span>;
  const flat = Math.abs(pctVal) < 0.05;
  const color = flat ? MUTED : pctVal >= 0 ? UP : DOWN;
  const arrow = flat ? "→" : pctVal >= 0 ? "▲" : "▼";
  return (
    <span className="font-mono tabular-nums" style={{ color }}>
      <span aria-hidden>{arrow}</span> {Math.abs(pctVal).toFixed(pctVal < 1 && !flat ? 2 : 1)}%
    </span>
  );
}

/**
 * Live Depth Drift — re-quotes the deepest pools' liquidity in the browser (DexScreener) and shows
 * how far live conditions have moved from the reproducible on-chain snapshot. The measured depth
 * numbers stay frozen (rigorous AMM quotes); this is a labelled live cross-check, never a rewrite.
 */
export default function LiveDepthDrift({
  live,
  ladders,
  snapshotMovable,
  snapshotTvl,
  asOf,
  onOpenPool,
}: {
  live: LiveState;
  ladders: DepthLadder[];
  snapshotMovable: number;
  snapshotTvl: number;
  asOf: string;
  onOpenPool: (key: string) => void;
}) {
  const now = useNow(1000);
  const pools = useMemo(() => snapshotPools(ladders), [ladders]);
  const drift = useMemo(() => matchDrift(pools, live.dexPairs, snapshotMovable), [pools, live.dexPairs, snapshotMovable]);
  const hasLive = drift.matched > 0;

  return (
    <Card
      label="Live depth drift"
      tier="supporting"
      right={
        hasLive ? (
          <StatusPill tone="up" dot pulse srText="live liquidity from DexScreener">
            LIVE · {ago(live.updatedDex, now)}
          </StatusPill>
        ) : (
          <StatusPill tone="neutral" dot srText="re-quoting live liquidity">
            RE-QUOTING…
          </StatusPill>
        )
      }
    >
      <p className="mb-3 max-w-2xl text-[12px] leading-snug text-muted">
        The depth measurement across this page is the reproducible {asOf} snapshot (real on-chain AMM quotes). This
        panel re-quotes pool liquidity live from DexScreener to show how far conditions have <b>drifted since</b> — it
        never changes the measured numbers.
      </p>

      {!hasLive ? (
        <div className="flex h-24 items-center justify-center rounded-sm border border-edge bg-panel2/40 font-mono text-[12px] text-muted">
          re-quoting live liquidity from public feeds…
        </div>
      ) : (
        <>
          {/* Ecosystem drift */}
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-sm border border-edge bg-panel2/50 p-3">
              <div className="card-label">Live liquidity · {drift.matched} pools</div>
              <div className="mt-1 font-display text-xl font-bold tabular-nums text-brand">
                <AnimatedNumber value={drift.liveLiqTotal} format={usd0} duration={0.5} />
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted">vs snapshot {usd0(drift.snapshotTvlTotal)}</div>
            </div>
            <div className="rounded-sm border border-edge bg-panel2/50 p-3">
              <div className="card-label">Drift since snapshot</div>
              <div className="mt-1 font-display text-xl font-bold">
                <Drift pctVal={drift.driftPct} />
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted">liquidity vs {asOf}</div>
            </div>
            <div className="rounded-sm border border-edge bg-panel2/50 p-3">
              <div className="card-label">
                Movable @ ≤2%{" "}
                <span className="rounded-sm border border-edge px-1 text-[8px] uppercase tracking-wide text-muted">est.</span>
              </div>
              <div className="mt-1 font-display text-xl font-bold tabular-nums text-sub">
                {drift.liveMovableEst !== null ? <AnimatedNumber value={drift.liveMovableEst} format={usd0} duration={0.5} /> : "—"}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted">snapshot × live/snapshot ratio</div>
            </div>
          </div>

          {/* Per-pool table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-edge text-left font-mono text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-semibold">Pool</th>
                  <th className="py-1.5 px-3 text-right font-semibold">Snapshot TVL</th>
                  <th className="py-1.5 px-3 text-right font-semibold">Live liquidity</th>
                  <th className="py-1.5 px-3 text-right font-semibold">Drift</th>
                  <th className="py-1.5 pl-3 text-right font-semibold">24h vol</th>
                </tr>
              </thead>
              <tbody>
                {drift.rows.map((r) => (
                  <tr key={r.pool.pool_id} className="border-b border-edge/50 transition-colors hover:bg-panel2/40">
                    <td className="py-1.5 pr-3">
                      <button
                        type="button"
                        onClick={() => onOpenPool(r.pool.key)}
                        className="font-display font-bold text-ink transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                        title={`Open ${r.pool.symbol} pool page`}
                      >
                        {r.pool.symbol} <span className="font-mono text-[9px] text-muted">↗</span>
                      </button>{" "}
                      <span className="font-mono text-[10px] text-muted">{r.pool.venue}</span>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer" className="ml-1 text-muted transition hover:text-brand" title="open pool on DexScreener">
                          dex↗
                        </a>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-muted">{usd0(r.pool.tvlUsd)}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-ink">
                      <AnimatedNumber value={r.liveLiq} format={usd0} duration={0.5} />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <Drift pctVal={r.driftPct} />
                    </td>
                    <td className="py-1.5 pl-3 text-right font-mono tabular-nums text-muted">{usd0(r.vol24 ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 font-mono text-[10px] text-muted">
            source: DexScreener live · matched by venue + token pair · coverage is partial (DexScreener tracks the more
            active Stacks pools). The full-ecosystem measurement basis is the snapshot's {usdCompact(snapshotTvl)} TVL.
          </p>
        </>
      )}
    </Card>
  );
}
