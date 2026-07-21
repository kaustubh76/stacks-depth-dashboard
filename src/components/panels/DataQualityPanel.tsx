import { useState } from "react";

import type { DepthLadder, Summary } from "../../api/types";
import { poolKey } from "../../lib/depth";
import { downloadText, dataQualityJson } from "../../lib/export";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import AnimatedNumber from "../ui/AnimatedNumber";
import { ChipButton } from "../ui/ChipButton";
import { usd0, pct } from "../../lib/format";

/** The honesty panel: what the vendor feeds got wrong, and how we cross-checked. The
 * clean / incl.-flagged toggle shows exactly what the flags are worth — the included
 * figure is always labelled as NOT the published number. */
export default function DataQualityPanel({
  summary,
  ladders,
  onOpenPool,
}: {
  summary: Summary;
  ladders: DepthLadder[];
  onOpenPool: (key: string) => void;
}) {
  const [inclFlagged, setInclFlagged] = useState(false);
  const shown = inclFlagged ? summary.volume_24h_usd_total : summary.volume_24h_usd_clean;
  const resolveKey = (poolId: string): string | null => {
    const cands = ladders.filter((l) => `${l.venue}:${l.pool_id}` === poolId);
    return cands.length ? poolKey(cands.reduce((a, b) => (b.depth_2pct_usd > a.depth_2pct_usd ? b : a))) : null;
  };

  return (
    <Card
      label="Data quality — what we flagged"
      tier="supporting"
      right={
        <span className="flex items-center gap-1.5">
          <ChipButton active={!inclFlagged} onClick={() => setInclFlagged(false)} ariaLabel="Show the published clean volume figure">
            clean
          </ChipButton>
          <ChipButton active={inclFlagged} onClick={() => setInclFlagged(true)} ariaLabel="Show volume including flagged outliers">
            incl. flagged
          </ChipButton>
          <ChipButton
            onClick={() => downloadText("stacks-data-quality.json", "application/json", dataQualityJson(summary))}
            title="download the data-quality summary (flags + disagreements) as JSON"
            ariaLabel="Download data quality summary as JSON"
          >
            ⬇ json
          </ChipButton>
        </span>
      }
    >
      <p className="mb-3 text-[12px] text-muted">
        The chain is source of truth; vendor APIs are the cross-check. Where they disagreed, we publish the disagreement
        rather than pick silently.
      </p>

      {/* The toggle-driven figure: what the flags are worth. */}
      <div className="mb-3 rounded-sm border border-edge bg-panel2/60 p-3" data-testid="quality-figure">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-2xl font-bold tabular-nums" style={{ color: inclFlagged ? "#d9a23a" : "#43b581" }}>
            <AnimatedNumber value={shown} format={usd0} duration={0.4} />
          </span>
          {inclFlagged ? (
            <StatusPill tone="warn" srText="includes flagged outlier volume — not the published figure">
              incl. flagged — not the published figure
            </StatusPill>
          ) : (
            <StatusPill tone="up" srText="the published clean figure">published clean figure</StatusPill>
          )}
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-muted">
          24h volume · flagged outliers: {usd0(summary.volume_24h_usd_flagged)} across {summary.flagged_pools.length} pool(s)
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {summary.flagged_pools.map((f) => (
          <div
            key={f.pool_id}
            className={`rounded-sm border bg-panel2 p-3 transition-opacity ${inclFlagged ? "border-amber/70" : "border-amber/40 opacity-80"}`}
          >
            <div className="mb-1 flex items-center gap-2">
              <StatusPill tone="warn" srText="flagged data-quality outlier">
                volume flag
              </StatusPill>
              {resolveKey(f.pool_id) ? (
                <button
                  type="button"
                  onClick={() => onOpenPool(resolveKey(f.pool_id)!)}
                  title={`open ${f.symbol} pool page`}
                  aria-label={`Open ${f.symbol} pool detail page`}
                  className="rounded-sm bg-muted/15 px-1 font-mono text-[11px] text-sub underline decoration-dotted underline-offset-2 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  {f.symbol} ↗
                </button>
              ) : (
                <code className="rounded-sm bg-muted/15 px-1 font-mono text-[11px] text-sub">{f.symbol}</code>
              )}
              {inclFlagged && <StatusPill tone="neutral" srText="currently included in the figure above">included above</StatusPill>}
            </div>
            <p className="text-[13px] leading-snug text-sub">
              Reports <b className="text-ink">{usd0(f.volume_24h_usd)}</b> of 24h volume — {f.note}. Excluded from clean
              volume ({usd0(summary.volume_24h_usd_clean)}).
            </p>
          </div>
        ))}
        {summary.price_disagreements.map((p) => (
          <div key={p.contract} className="rounded-sm border border-edge bg-panel2 p-3">
            <div className="mb-1 flex items-center gap-2">
              <StatusPill tone="info" srText="cross-feed price disagreement">
                price spread
              </StatusPill>
              <code className="rounded-sm bg-muted/15 px-1 font-mono text-[11px] text-sub">{p.symbol}</code>
            </div>
            <p className="text-[13px] leading-snug text-sub">
              ALEX and Velar price it <b className="text-ink">{pct(p.spread, 1)}</b> apart (
              {usd0(p.alex)} vs {usd0(p.velar)}). We publish both and use the mean ({usd0(p.chosen)}).
            </p>
          </div>
        ))}
        <div className="rounded-sm border border-up/30 bg-panel2 p-3">
          <div className="mb-1 flex items-center gap-2">
            <StatusPill tone="up" srText="independent corroboration">
              cross-check
            </StatusPill>
          </div>
          <p className="text-[13px] leading-snug text-sub">
            DexScreener — an independent free aggregator — reports{" "}
            <b className="text-ink">{usd0(summary.volume_24h_usd_dex_total)}</b> of 24h DEX volume across the same pools,
            corroborating the on-chain clean figure.
          </p>
        </div>
      </div>
    </Card>
  );
}
