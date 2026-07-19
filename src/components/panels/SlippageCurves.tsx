import type { DepthLadder } from "../../api/types";
import Card from "../ui/Card";
import { usd0 } from "../../lib/format";

const PALETTE = ["#38b2c4", "#43b581", "#d9a23a", "#8b9dff", "#e0728a", "#3861fb"];

// Chart geometry.
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

// x: log10(notional) over $100..$100k. y: sqrt scale so low-slippage detail is legible.
function xOf(notional: number): number {
  const v = (Math.log10(Math.max(notional, 100)) - 2) / 3;
  return L + Math.min(Math.max(v, 0), 1) * PW;
}
function yOf(slip: number): number {
  const v = Math.sqrt(Math.min(slip, SLIP_CAP) / SLIP_CAP);
  return T + (1 - v) * PH;
}

export default function SlippageCurves({ ladders }: { ladders: DepthLadder[] }) {
  return (
    <Card label="Slippage curves — the deepest pools" tier="supporting">
      <p className="mb-3 max-w-2xl text-[12px] leading-snug text-muted">
        Real on-chain AMM quotes (Bitflow <code className="rounded-sm bg-muted/15 px-1 font-mono">get-dy</code> /
        stableswap <code className="rounded-sm bg-muted/15 px-1 font-mono">get-y</code>, ALEX{" "}
        <code className="rounded-sm bg-muted/15 px-1 font-mono">get-helper</code>; Velar is exact constant-product).
        Price impact vs trade size — lower and flatter is deeper.
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block min-w-[440px]" role="img" aria-label="slippage curves">
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
          {ladders.map((lad, i) => {
            const color = PALETTE[i % PALETTE.length];
            const pts = lad.points.map((p) => `${xOf(p.notional).toFixed(1)},${yOf(p.slippage).toFixed(1)}`).join(" ");
            const last = lad.points[lad.points.length - 1];
            return (
              <g key={`${lad.venue}:${lad.pool_id}`}>
                <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                {last && <circle cx={xOf(last.notional)} cy={yOf(last.slippage)} r={3} fill={color} />}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {ladders.map((lad, i) => (
          <span key={`${lad.venue}:${lad.pool_id}`} className="flex items-center gap-1.5 text-[12px] text-muted">
            <i className="inline-block h-[3px] w-3 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-sub">{lad.symbol}</span>
            <span className="opacity-70">
              {lad.venue} · {usd0(lad.depth_2pct_usd)} @≤2%
            </span>
          </span>
        ))}
      </div>
    </Card>
  );
}
