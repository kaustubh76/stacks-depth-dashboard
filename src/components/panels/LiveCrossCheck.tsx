import { useEffect, useRef, useState } from "react";

import type { LiveState } from "../../hooks/useLiveData";
import { useNow } from "../../hooks/useNow";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import AnimatedNumber from "../ui/AnimatedNumber";
import Sparkline from "../ui/Sparkline";
import { usd0, usd, int, ago } from "../../lib/format";

function Delta({ v }: { v: number | null }) {
  if (v === null) return null;
  const color = v >= 0 ? "#43b581" : "#e0728a";
  return (
    <span className="ml-1.5 text-[12px] font-bold" style={{ color }}>
      <span aria-hidden>{v >= 0 ? "▲" : "▼"}</span> {Math.abs(v).toFixed(2)}%
      <span className="sr-only">{v >= 0 ? "up" : "down"} 24 hours</span>
    </span>
  );
}

function LiveTile({
  label,
  children,
  source,
  updated,
  now,
  pulse = false,
}: {
  label: string;
  children: React.ReactNode;
  source: string;
  updated: number | null;
  now: number;
  pulse?: boolean;
}) {
  return (
    <div
      className="rounded-sm border bg-panel2/60 p-3 transition-all duration-300"
      style={pulse ? { borderColor: "#43b581", boxShadow: "0 0 0 3px rgba(67,181,129,0.18)" } : { borderColor: "rgb(var(--c-edge))" }}
    >
      <div className="card-label">{label}</div>
      <div className="mt-1.5 font-display text-xl font-bold tabular-nums text-ink">{children}</div>
      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] text-muted">
        <span>{source}</span>
        <span>{updated ? ago(updated, now) : "…"}</span>
      </div>
    </div>
  );
}

/**
 * The one genuinely-live surface: Stacks chain height + STX/BTC price + DEX volume from
 * public CORS-open feeds, refreshed in the browser. Clearly separated from the reproducible
 * snapshot — a LIVE pill when any feed has answered, else SNAPSHOT.
 */
export default function LiveCrossCheck({
  live,
  snapshotCleanVol,
  asOf,
  enabled,
  onToggle,
  onRefresh,
}: {
  live: LiveState;
  snapshotCleanVol: number;
  asOf: string;
  enabled: boolean;
  onToggle: () => void;
  onRefresh?: () => void;
}) {
  const now = useNow(1000);

  // Flash the block tile the moment a new Stacks block lands.
  const prevHeight = useRef<number | null>(null);
  const [blockPulse, setBlockPulse] = useState(false);
  useEffect(() => {
    if (live.chainHeight !== null && prevHeight.current !== null && live.chainHeight !== prevHeight.current) {
      setBlockPulse(true);
      const t = window.setTimeout(() => setBlockPulse(false), 900);
      prevHeight.current = live.chainHeight;
      return () => window.clearTimeout(t);
    }
    prevHeight.current = live.chainHeight;
  }, [live.chainHeight]);

  const volDelta =
    live.dexVolume24h !== null && snapshotCleanVol > 0
      ? ((live.dexVolume24h - snapshotCleanVol) / snapshotCleanVol) * 100
      : null;

  return (
    <Card
      label="Live cross-check"
      tier="supporting"
      right={
        <div className="flex items-center gap-2">
          {enabled && live.anyLive ? (
            <StatusPill tone="up" dot pulse srText="live data from public feeds">
              LIVE
            </StatusPill>
          ) : (
            <StatusPill tone="neutral" dot srText={enabled ? "connecting to live feeds" : "live feeds paused"}>
              {enabled ? "CONNECTING" : "PAUSED"}
            </StatusPill>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {enabled ? "pause" : "resume"}
          </button>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh live data now"
              title="refresh live data"
              className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              ↻ refresh
            </button>
          )}
        </div>
      }
    >
      <p className="mb-3 text-[12px] leading-snug text-muted">
        Live from the chain and public price/DEX feeds — a real-time check on the frozen {asOf} measurement
        below. These update; the snapshot does not.
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <LiveTile label="Stacks block" source="Hiro" updated={live.updatedChain} now={now} pulse={blockPulse}>
          {live.chainHeight !== null ? (
            <AnimatedNumber value={live.chainHeight} format={(n) => `#${int(n)}`} />
          ) : (
            "—"
          )}
        </LiveTile>
        <LiveTile label="STX price" source="CoinGecko" updated={live.updatedPrice} now={now}>
          {live.stx ? (
            <>
              <AnimatedNumber value={live.stx.usd} duration={0.6} flash format={(n) => usd(n, 4)} />
              <Delta v={live.stx.change24h} />
            </>
          ) : (
            "—"
          )}
        </LiveTile>
        <LiveTile label="BTC price" source="CoinGecko" updated={live.updatedPrice} now={now}>
          {live.btc ? (
            <>
              <AnimatedNumber value={live.btc.usd} duration={0.6} flash format={(n) => usd0(n)} />
              <Delta v={live.btc.change24h} />
            </>
          ) : (
            "—"
          )}
        </LiveTile>
        <LiveTile label="DEX 24h volume" source={`DexScreener · ${live.dexPairs.length || "—"} pairs`} updated={live.updatedDex} now={now}>
          {live.dexVolume24h !== null ? (
            <>
              <AnimatedNumber value={live.dexVolume24h} duration={0.6} format={(n) => usd0(n)} />
              {volDelta !== null && <Delta v={volDelta} />}
            </>
          ) : (
            "—"
          )}
        </LiveTile>
      </div>
      {live.stxHistory.length >= 2 && (
        <div className="mt-3 rounded-sm border border-edge bg-panel2/40 p-2.5">
          <div className="mb-1 flex items-center justify-between">
            <span className="card-label">STX · this session</span>
            <span className="font-mono text-[10px] text-muted">{live.stxHistory.length} samples · builds every 30s</span>
          </div>
          <Sparkline data={live.stxHistory} color="auto" height={34} />
        </div>
      )}
      <p className="mt-2.5 border-t border-edge pt-2 font-mono text-[10px] text-muted">
        snapshot clean volume {usd0(snapshotCleanVol)} · live DEX volume is an independent cross-check, not a
        replacement — the measurement stands on the committed on-chain harvest.
      </p>
    </Card>
  );
}
