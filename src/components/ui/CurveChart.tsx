import type { SlippagePoint } from "../../api/types";
import { slippageAt } from "../../lib/depth";
import { pct, usd0 } from "../../lib/format";

// Pure presentational slippage-curve chart (log-x $100..$100k, sqrt-y capped at 25%),
// extracted from the retired SlippageCurves panel so PoolCompare can overlay any set of
// ladders with the shared budget line and trade-size marker.

const W = 560;
const H = 264;
const L = 44;
const R = 14;
const T = 14;
const B = 34;
const PW = W - L - R;
const PH = H - T - B;

const SLIP_CAP = 0.25; // clamp display at 25% slippage
const GRID_SLIP = [0.02, 0.05, 0.1, 0.2];
const X_TICKS = [100, 1000, 10000, 100000];

function xOf(notional: number): number {
  const v = (Math.log10(Math.max(notional, 100)) - 2) / 3;
  return L + Math.min(Math.max(v, 0), 1) * PW;
}
function yOf(slip: number): number {
  const v = Math.sqrt(Math.min(slip, SLIP_CAP) / SLIP_CAP);
  return T + (1 - v) * PH;
}

export interface CurveSeries {
  key: string;
  label: string;
  color: string;
  points: SlippagePoint[];
}

export default function CurveChart({
  series,
  budget,
  moveX,
}: {
  series: CurveSeries[];
  /** Dashed budget line (rose), when within the display cap. */
  budget?: number;
  /** Pinned trade-size marker + a dot per series at its slippage there. */
  moveX?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block min-w-[440px]" role="img" aria-label="overlaid slippage curves">
        {GRID_SLIP.map((s) => (
          <g key={s}>
            <line x1={L} y1={yOf(s)} x2={W - R} y2={yOf(s)} stroke="rgb(var(--c-edge))" />
            <text x={4} y={yOf(s) + 3} fontSize={10} fill="rgb(var(--c-muted))" className="font-mono">
              {s * 100}%
            </text>
          </g>
        ))}
        {X_TICKS.map((n) => (
          <text key={n} x={xOf(n)} y={H - 10} fontSize={10} fill="rgb(var(--c-muted))" textAnchor="middle" className="font-mono">
            {n >= 1000 ? `$${n / 1000}k` : `$${n}`}
          </text>
        ))}
        {budget !== undefined && budget <= SLIP_CAP && (
          <g>
            <line x1={L} y1={yOf(budget)} x2={W - R} y2={yOf(budget)} stroke="#e0728a" strokeDasharray="3 3" strokeWidth={1.2} opacity={0.8} />
            <text x={W - R} y={yOf(budget) - 4} fontSize={9.5} fill="#e0728a" textAnchor="end" className="font-mono">
              budget {pct(budget, 1)}
            </text>
          </g>
        )}
        {moveX !== undefined && (
          <g>
            <line x1={xOf(moveX)} y1={T} x2={xOf(moveX)} y2={T + PH} stroke="var(--thick-line)" strokeWidth={1.4} />
            <text x={xOf(moveX)} y={H - 22} fontSize={10} fill="rgb(var(--c-ink))" textAnchor="middle" className="font-mono font-bold">
              {usd0(moveX)}
            </text>
          </g>
        )}
        {series.map((s) => {
          const pts = s.points.map((p) => `${xOf(p.notional).toFixed(1)},${yOf(p.slippage).toFixed(1)}`).join(" ");
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.key}>
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" />
              {last && <circle cx={xOf(last.notional)} cy={yOf(last.slippage)} r={3} fill={s.color} />}
              {moveX !== undefined && (
                <circle cx={xOf(moveX)} cy={yOf(slippageAt(s.points, moveX))} r={3.5} fill={s.color} stroke="var(--canvas)" strokeWidth={1} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
