import type { Summary } from "../../api/types";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import { usd0, pct } from "../../lib/format";

/** The honesty panel: what the vendor feeds got wrong, and how we cross-checked. */
export default function DataQualityPanel({ summary }: { summary: Summary }) {
  return (
    <Card label="Data quality — what we flagged" tier="supporting">
      <p className="mb-3 text-[12px] text-muted">
        The chain is source of truth; vendor APIs are the cross-check. Where they disagreed, we publish the disagreement
        rather than pick silently.
      </p>
      <div className="flex flex-col gap-3">
        {summary.flagged_pools.map((f) => (
          <div key={f.pool_id} className="rounded-sm border border-amber/40 bg-panel2 p-3">
            <div className="mb-1 flex items-center gap-2">
              <StatusPill tone="warn" srText="flagged data-quality outlier">
                volume flag
              </StatusPill>
              <code className="rounded-sm bg-muted/15 px-1 font-mono text-[11px] text-sub">{f.symbol}</code>
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
