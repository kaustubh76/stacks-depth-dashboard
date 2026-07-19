import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useRef, useState } from "react";

import type { DepthLadder } from "../../api/types";
import { poolKey, slippageAt, realizedForNotional } from "../../lib/depth";
import Card from "../ui/Card";
import StatusPill from "../ui/StatusPill";
import { usd0, pct } from "../../lib/format";

const PALETTE = ["#38b2c4", "#43b581", "#d9a23a", "#8b9dff", "#e0728a", "#3861fb", "#23c4d6", "#c2a633"];

// Geometry (viewBox units; SVG scales responsively).
const W = 640;
const H = 300;
const L = 48;
const R = 16;
const T = 16;
const B = 40;
const PW = W - L - R;
const PH = H - T - B;
const SLIP_CAP = 0.25;
const GRID_SLIP = [0.02, 0.05, 0.1, 0.2];
const X_TICKS = [100, 1000, 10000, 100000];

const xOf = (n: number) => L + (Math.min(Math.max(Math.log10(n), 2), 5) - 2) / 3 * PW;
const yOf = (s: number) => T + (1 - Math.sqrt(Math.min(s, SLIP_CAP) / SLIP_CAP)) * PH;
const nOfFrac = (frac: number) => Math.round(10 ** (2 + Math.min(Math.max(frac, 0), 1) * 3));

/**
 * The hero interaction. Drag anywhere on the chart to set a trade size; the pinned line +
 * side readout show the exact slippage each pool would charge and which assets clear the
 * current slippage budget. Hover shows a live crosshair preview. Legend chips toggle pools;
 * a `focus` key (set from the Pool browser's "curve" action) isolates one pool's curve.
 */
export default function SlippageExplorer({
  ladders,
  moveX,
  setMoveX,
  budget,
  focus,
  onClearFocus,
}: {
  ladders: DepthLadder[];
  moveX: number;
  setMoveX: (n: number) => void;
  budget: number;
  focus: string | null;
  onClearFocus: () => void;
}) {
  const reduce = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverN, setHoverN] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  // Default to the deepest ~7 pools; "show all" reveals the long tail. A focused pool is
  // always drawn, even when it sits outside the top 7.
  const shown = useMemo(() => {
    const base = showAll ? ladders : ladders.slice(0, 7);
    if (focus && !base.some((l) => poolKey(l) === focus)) {
      const f = ladders.find((l) => poolKey(l) === focus);
      if (f) return [...base, f];
    }
    return base;
  }, [ladders, showAll, focus]);
  const visible = shown.filter((l) => !hidden.has(poolKey(l)));
  const focused = focus ? ladders.find((l) => poolKey(l) === focus) ?? null : null;

  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    ladders.forEach((l, i) => m.set(poolKey(l), PALETTE[i % PALETTE.length]));
    return m;
  }, [ladders]);

  const setFromEvent = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = (clientX - rect.left) / rect.width; // rect maps to full viewBox width
    const vbX = frac * W;
    const plotFrac = (vbX - L) / PW;
    return nOfFrac(plotFrac);
  };

  const readout = useMemo(() => realizedForNotional(visible, moveX), [visible, moveX]);
  const clearing = readout.filter((r) => r.feasible && r.slippage <= budget);

  return (
    <Card
      label="Slippage explorer"
      tier="hero"
      accent="#38b2c4"
      right={
        <span className="flex items-center gap-2">
          {focused && (
            <button
              type="button"
              onClick={onClearFocus}
              title="clear the focused pool"
              className="rounded-sm border border-brand bg-brand/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-brand transition hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              focus: {focused.symbol} ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {showAll ? `top 7` : `all ${ladders.length}`}
          </button>
        </span>
      }
    >
      <p className="mb-3 max-w-2xl text-[12px] leading-snug text-muted">
        Drag across the chart to set a trade size. Real on-chain AMM quotes — lower and flatter is deeper. The pinned
        line is your trade; the readout shows what each asset's best pool would charge.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(200px,260px)]">
        {/* Chart */}
        <div className="relative overflow-x-auto">
          {!touched && (
            <div className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 animate-pulse rounded-sm border border-brand/40 bg-panel/90 px-2 py-0.5 font-mono text-[10px] font-bold text-brand">
              ⟵ drag to set a trade size ⟶
            </div>
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            className="block min-w-[460px] touch-none select-none"
            role="img"
            aria-label="interactive slippage curves — drag to set trade size"
            style={{ cursor: "ew-resize" }}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDragging(true);
              setTouched(true);
              const n = setFromEvent(e.clientX);
              if (n) setMoveX(n);
            }}
            onPointerMove={(e) => {
              const n = setFromEvent(e.clientX);
              if (n) setHoverN(n);
              if (dragging && n) setMoveX(n);
            }}
            onPointerUp={() => setDragging(false)}
            onPointerLeave={() => {
              setDragging(false);
              setHoverN(null);
            }}
          >
            {/* Y gridlines */}
            {GRID_SLIP.map((s) => (
              <g key={s}>
                <line x1={L} y1={yOf(s)} x2={W - R} y2={yOf(s)} stroke="rgb(var(--c-edge))" />
                <text x={6} y={yOf(s) + 3} fontSize={10} fill="rgb(var(--c-muted))" className="font-mono">
                  {s * 100}%
                </text>
              </g>
            ))}
            {/* budget line */}
            {budget <= SLIP_CAP && (
              <g>
                <line x1={L} y1={yOf(budget)} x2={W - R} y2={yOf(budget)} stroke="#e0728a" strokeDasharray="3 3" strokeWidth={1.2} opacity={0.8} />
                <text x={W - R} y={yOf(budget) - 4} fontSize={9.5} fill="#e0728a" textAnchor="end" className="font-mono">
                  budget {pct(budget, 1)}
                </text>
              </g>
            )}
            {/* X ticks */}
            {X_TICKS.map((n) => (
              <text key={n} x={xOf(n)} y={H - 12} fontSize={10} fill="rgb(var(--c-muted))" textAnchor="middle" className="font-mono">
                {n >= 1000 ? `$${n / 1000}k` : `$${n}`}
              </text>
            ))}
            {/* hover crosshair */}
            {hoverN && !dragging && (
              <line x1={xOf(hoverN)} y1={T} x2={xOf(hoverN)} y2={T + PH} stroke="rgb(var(--c-muted))" strokeWidth={1} opacity={0.4} />
            )}
            {/* curves — draw themselves in on load; focus isolates one pool */}
            {visible.map((l, i) => {
              const key = poolKey(l);
              const color = colorFor.get(key)!;
              const isFocused = focus === key;
              const dimmed = focus !== null && !isFocused;
              const pts = l.points
                .map((p) => `${xOf(p.notional).toFixed(1)},${yOf(p.slippage).toFixed(1)}`)
                .join(" ");
              return (
                <motion.polyline
                  key={key}
                  points={pts}
                  fill="none"
                  stroke={color}
                  strokeWidth={isFocused ? 3 : 1.9}
                  strokeLinejoin="round"
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: dimmed ? 0.25 : isFocused ? 1 : 0.92 }}
                  transition={{ duration: 0.9, delay: Math.min(i, 8) * 0.05, ease: "easeOut" }}
                />
              );
            })}
            {/* pinned trade-size line + dots */}
            <line x1={xOf(moveX)} y1={T} x2={xOf(moveX)} y2={T + PH} stroke="var(--thick-line)" strokeWidth={1.6} />
            {!touched && <circle cx={xOf(moveX)} cy={T} r={7} fill="none" stroke="#38b2c4" strokeWidth={1.5} className="animate-pulseDot" />}
            <circle cx={xOf(moveX)} cy={T} r={4} fill="var(--thick-line)" />
            {visible.map((l) => {
              const key = poolKey(l);
              const s = slippageAt(l.points, moveX);
              const dimmed = focus !== null && focus !== key;
              return (
                <circle
                  key={`d-${key}`}
                  cx={xOf(moveX)}
                  cy={yOf(s)}
                  r={focus === key ? 4 : 3}
                  fill={colorFor.get(key)!}
                  stroke="var(--canvas)"
                  strokeWidth={1}
                  opacity={dimmed ? 0.3 : 1}
                />
              );
            })}
            <text x={xOf(moveX)} y={T + PH + 26} fontSize={11} fill="rgb(var(--c-ink))" textAnchor="middle" className="font-mono font-bold">
              {usd0(moveX)}
            </text>
          </svg>

          {/* Legend / toggles */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
            {shown.map((l) => {
              const key = poolKey(l);
              const off = hidden.has(key);
              const isFocused = focus === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  className={`flex items-center gap-1.5 rounded-sm px-1 text-[11.5px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${off ? "opacity-40" : ""} ${isFocused ? "bg-brand/10 ring-1 ring-brand/50" : ""}`}
                  title={off ? "show" : "hide"}
                >
                  <i className="inline-block h-[3px] w-3 rounded-sm" style={{ background: colorFor.get(key)! }} />
                  <span className="text-sub">{l.symbol}</span>
                  <span className="font-mono text-[10px] text-muted">{l.major_symbol}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Readout */}
        <div className="rounded-sm border border-edge bg-panel2/50 p-3">
          <div className="flex items-center justify-between">
            <span className="card-label">At {usd0(moveX)}</span>
            <StatusPill tone={clearing.length >= 3 ? "up" : clearing.length > 0 ? "warn" : "down"} srText="assets clearing budget">
              {clearing.length} clear ≤{pct(budget, 1)}
            </StatusPill>
          </div>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {readout.map((r) => {
              const ok = r.feasible && r.slippage <= budget;
              return (
                <li key={r.asset} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ok ? "#43b581" : "#8a8f9c" }} />
                    <span className="font-display font-bold text-ink">{r.asset}</span>
                    <span className="font-mono text-[10px] text-muted">{r.bestPoolSymbol}</span>
                  </span>
                  <span className="font-mono tabular-nums" style={{ color: !r.feasible ? "#8a8f9c" : ok ? "#43b581" : "#e0728a" }}>
                    {r.feasible ? pct(r.slippage, r.slippage < 0.1 ? 2 : 1) : "no fill"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 border-t border-edge pt-2 text-[11px] leading-snug text-muted">
            best-pool price impact per asset at this size. Drag the chart or use the calculator to change it.
          </p>
        </div>
      </div>
    </Card>
  );
}
