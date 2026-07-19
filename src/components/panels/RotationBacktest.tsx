import { useState } from "react";

import type { Audit } from "../../api/types";
import Card from "../ui/Card";
import { ChipButton } from "../ui/ChipButton";
import { pct, signedPct } from "../../lib/format";

/**
 * The second-angle confirmation: a momentum rotation loses money at every realistic
 * friction. Pick a friction level (or snap to your slippage budget) to headline that row.
 */
export default function RotationBacktest({ audit, budget }: { audit: Audit; budget: number }) {
  const rows = [...audit.results].sort((a, b) => a.one_way - b.one_way);
  const [sel, setSel] = useState(() =>
    rows.some((r) => Math.abs(r.one_way - 0.01) < 1e-9) ? 0.01 : rows[0]?.one_way ?? 0,
  );
  const selected = rows.find((r) => Math.abs(r.one_way - sel) < 1e-9) ?? rows[0];

  const snapToBudget = () => {
    if (rows.length === 0) return;
    const nearest = rows.reduce((a, b) => (Math.abs(b.one_way - budget) < Math.abs(a.one_way - budget) ? b : a));
    setSel(nearest.one_way);
  };

  return (
    <Card label="Rotation backtest — the second angle" tier="supporting">
      <p className="mb-3 max-w-2xl text-[12px] leading-snug text-muted">
        A long-only momentum rotation over {audit.tokens.join(" + ")} ({audit.n_assets} assets, {audit.n_bars} daily
        bars). Total return degrades monotonically with trading friction — no edge survives, corroborating the depth
        verdict from a second angle.
      </p>

      {/* Friction selector */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">one-way friction</span>
        {rows.map((r) => (
          <ChipButton
            key={r.one_way}
            active={Math.abs(r.one_way - sel) < 1e-9}
            onClick={() => setSel(r.one_way)}
            ariaLabel={`Select ${pct(r.one_way, 2)} one-way friction`}
          >
            {pct(r.one_way, 2)}
          </ChipButton>
        ))}
        <ChipButton onClick={snapToBudget} title={`snap to the level nearest your ≤${pct(budget, 2)} budget`} ariaLabel="Snap friction to my slippage budget">
          ≈ my budget
        </ChipButton>
      </div>

      {/* Headline for the selected level */}
      {selected && (
        <div className="mb-3 rounded-sm border border-edge bg-panel2/60 px-3 py-2 font-mono text-[12px] text-sub" data-testid="friction-headline">
          At <b className="text-ink">{pct(selected.one_way, 2)}</b> one-way friction:{" "}
          <b style={{ color: selected.total_return >= 0 ? "#43b581" : "#e0728a" }}>{signedPct(selected.total_return, 1)}</b> total
          return · {pct(selected.max_dd, 1)} max drawdown · {pct(selected.pct_windows_up, 1)} weeks up ({selected.n_windows})
        </div>
      )}

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
            {rows.map((r) => {
              const isSel = Math.abs(r.one_way - sel) < 1e-9;
              return (
                <tr
                  key={r.one_way}
                  onClick={() => setSel(r.one_way)}
                  className={`cursor-pointer border-b border-edge/50 transition-colors ${isSel ? "bg-brand/5" : "hover:bg-panel2/40"}`}
                  data-selected={isSel || undefined}
                >
                  <td className={`py-1.5 pr-3 font-mono tabular-nums ${isSel ? "border-l-2 border-brand pl-2 font-bold text-brand" : "text-sub"}`}>
                    {pct(r.one_way, 2)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums" style={{ color: "#e0728a" }}>
                    {signedPct(r.total_return, 1)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{pct(r.max_dd, 1)}</td>
                  <td className="py-1.5 pl-3 text-right font-mono tabular-nums text-sub">
                    {pct(r.pct_windows_up, 1)}{" "}
                    <span className="text-muted opacity-70">({r.n_windows})</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-edge pt-2 text-[12px] leading-snug text-muted">{audit.finding}</p>
    </Card>
  );
}
