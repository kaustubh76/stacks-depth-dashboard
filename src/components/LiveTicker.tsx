import type { LiveState } from "../hooks/useLiveData";
import { useNow } from "../hooks/useNow";
import { usd, usd0, ago, int } from "../lib/format";
import StatusPill from "./ui/StatusPill";

/** A thin always-on live ribbon so the very top of the page reads current, not frozen:
 * Stacks block height + STX/BTC price + "updated Ns ago", straight from the public feeds. */
export default function LiveTicker({ live }: { live: LiveState }) {
  const now = useNow(1000);
  const on = live.anyLive;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-edge bg-panel2/40 px-3 py-1.5 font-mono text-[11px] text-muted">
      <StatusPill tone={on ? "up" : "neutral"} dot pulse={on} srText={on ? "live feeds connected" : "connecting to live feeds"}>
        {on ? "LIVE" : "…"}
      </StatusPill>
      {live.chainHeight !== null && (
        <span>
          Stacks <span className="text-sub">#{int(live.chainHeight)}</span>
        </span>
      )}
      {live.stx && (
        <span>
          STX <span className="text-sub">{usd(live.stx.usd, 4)}</span>
          {live.stx.change24h !== null && (
            <span style={{ color: live.stx.change24h >= 0 ? "#43b581" : "#e0728a" }}> {live.stx.change24h >= 0 ? "▲" : "▼"}{Math.abs(live.stx.change24h).toFixed(1)}%</span>
          )}
        </span>
      )}
      {live.btc && (
        <span>
          BTC <span className="text-sub">{usd0(live.btc.usd)}</span>
        </span>
      )}
      {live.dexLiquidityTotal !== null && (
        <span>
          DEX liq <span className="text-sub">{usd0(live.dexLiquidityTotal)}</span>
        </span>
      )}
      <span className="ml-auto opacity-70">{on ? `updated ${ago(live.updatedChain ?? live.updatedPrice, now)}` : "connecting…"}</span>
    </div>
  );
}
