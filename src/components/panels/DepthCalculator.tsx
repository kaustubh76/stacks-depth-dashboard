import type { DepthLadder } from "../../api/types";
import { realizedForNotional } from "../../lib/depth";
import { X_MIN, X_MAX } from "../../hooks/useHashState";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import { usd0, pct } from "../../lib/format";

const QUICK = [1000, 10000, 50000, 100000];

// Map a trade size to a 0..1 slider position on a log scale ($100..$100k) and back.
const toSlider = (n: number) => (Math.log10(n) - Math.log10(X_MIN)) / (Math.log10(X_MAX) - Math.log10(X_MIN));
const fromSlider = (f: number) => Math.round(10 ** (Math.log10(X_MIN) + f * (Math.log10(X_MAX) - Math.log10(X_MIN))));

/**
 * The report-becomes-a-tool panel: type or slide a dollar size and get the slippage you'd
 * pay per asset (best pool), plus a plain-English verdict at the current budget. Shares the
 * `moveX` state with the explorer, so dragging one moves the other.
 */
export default function DepthCalculator({
  ladders,
  moveX,
  setMoveX,
  budget,
}: {
  ladders: DepthLadder[];
  moveX: number;
  setMoveX: (n: number) => void;
  budget: number;
}) {
  const rows = realizedForNotional(ladders, moveX);
  const clearing = rows.filter((r) => r.feasible && r.slippage <= budget);
  const best = rows[0];

  return (
    <Card label="Depth calculator" tier="supporting" accent="#43b581">
      <p className="mb-3 text-[12px] leading-snug text-muted">
        “If I wanted to move $X, what would it cost?” Type a size — every number is a real on-chain AMM quote through
        each asset's deepest pool.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-sm border-3 border-[color:var(--thick-line)] bg-panel2 px-2 py-1">
          <span className="font-mono text-sm text-muted">$</span>
          <input
            type="number"
            min={X_MIN}
            max={X_MAX}
            step={100}
            value={moveX}
            onChange={(e) => setMoveX(parseFloat(e.target.value) || X_MIN)}
            aria-label="Trade size in USD"
            className="w-28 bg-transparent px-1 font-display text-lg font-bold tabular-nums text-ink outline-none"
          />
        </div>
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setMoveX(q)}
            className={`rounded-sm border px-2 py-1 font-mono text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
              moveX === q ? "border-brand bg-brand/10 text-brand" : "border-edge text-muted hover:border-brand hover:text-brand"
            }`}
          >
            {usd0(q)}
          </button>
        ))}
      </div>

      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={toSlider(moveX)}
        onChange={(e) => setMoveX(fromSlider(parseFloat(e.target.value)))}
        aria-label="Trade size"
        className="mt-3 w-full accent-brand"
      />

      <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
        <span className="text-[13px] text-sub">
          At <b className="text-ink">{usd0(moveX)}</b>, {clearing.length > 0 ? (
            <>you could move it on <b className="text-ink">{clearing.map((c) => c.asset).join(", ")}</b> within {pct(budget, 1)}</>
          ) : (
            <>no asset absorbs it within {pct(budget, 1)}</>
          )}
          {best && best.feasible && <> — cheapest is <b className="text-ink">{best.asset}</b> at {pct(best.slippage, 2)}</>}.
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map((r) => {
          const ok = r.feasible && r.slippage <= budget;
          return (
            <li key={r.asset} className="rounded-sm border border-edge bg-panel2/50 p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-ink">{r.asset}</span>
                <StatusPill tone={ok ? "up" : "neutral"} srText={ok ? "clears budget" : "over budget or no fill"}>
                  {ok ? "ok" : r.feasible ? "over" : "n/a"}
                </StatusPill>
              </div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums" style={{ color: !r.feasible ? "#8a8f9c" : ok ? "#43b581" : "#e0728a" }}>
                {r.feasible ? pct(r.slippage, r.slippage < 0.1 ? 2 : 1) : "no fill"}
              </div>
              <div className="font-mono text-[10px] text-muted">{r.bestPoolSymbol}</div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
