import type { Audit } from "../../api/types";
import Card from "../ui/Card";
import { pct, signedPct } from "../../lib/format";

/** The second-angle confirmation: a momentum rotation loses money at every realistic friction. */
export default function RotationBacktest({ audit }: { audit: Audit }) {
  const rows = [...audit.results].sort((a, b) => a.one_way - b.one_way);
  return (
    <Card label="Rotation backtest — the second angle" tier="supporting">
      <p className="mb-3 max-w-2xl text-[12px] leading-snug text-muted">
        A long-only momentum rotation over {audit.tokens.join(" + ")} ({audit.n_assets} assets, {audit.n_bars} daily
        bars). Total return degrades monotonically with trading friction — no edge survives, corroborating the depth
        verdict from a second angle.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-edge text-left font-mono text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3 font-semibold">One-way friction</th>
              <th className="py-1.5 px-3 text-right font-semibold">Total return</th>
              <th className="py-1.5 px-3 text-right font-semibold">Max drawdown</th>
              <th className="py-1.5 pl-3 text-right font-semibold">Weeks up</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.one_way} className="border-b border-edge/50">
                <td className="py-1.5 pr-3 font-mono tabular-nums text-sub">{pct(r.one_way, 2)}</td>
                <td className="py-1.5 px-3 text-right font-mono tabular-nums" style={{ color: "#e0728a" }}>
                  {signedPct(r.total_return, 1)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{pct(r.max_dd, 1)}</td>
                <td className="py-1.5 pl-3 text-right font-mono tabular-nums text-sub">
                  {pct(r.pct_windows_up, 1)}{" "}
                  <span className="text-muted opacity-70">({r.n_windows})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-edge pt-2 text-[12px] leading-snug text-muted">{audit.finding}</p>
    </Card>
  );
}
