import { usd0, pct } from "../../lib/format";

interface Preset {
  label: string;
  b: number;
  x: number;
}

const PRESETS: Preset[] = [
  { label: "Deploy $50k @ ≤2%", b: 0.02, x: 50000 },
  { label: "Move $10k @ ≤1%", b: 0.01, x: 10000 },
  { label: "Tighten to ≤0.5%", b: 0.005, x: 2500 },
  { label: "Stress $100k @ ≤5%", b: 0.05, x: 100000 },
];

const eq = (a: number, b: number) => Math.abs(a - b) < Math.max(1e-6, Math.abs(b) * 1e-4);

/** One-click scenarios: set the slippage budget AND trade size together, so a single tap
 * demonstrates the whole tool (and updates the shareable deep-link). */
export default function ScenarioPresets({
  budget,
  moveX,
  setBudget,
  setMoveX,
}: {
  budget: number;
  moveX: number;
  setBudget: (b: number) => void;
  setMoveX: (n: number) => void;
}) {
  const apply = (p: Preset) => {
    setBudget(p.b);
    setMoveX(p.x);
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Try a scenario</span>
      {PRESETS.map((p) => {
        const active = eq(budget, p.b) && eq(moveX, p.x);
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => apply(p)}
            className={`rounded-sm border px-2.5 py-1 font-mono text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
              active ? "border-brand bg-brand/10 text-brand" : "border-edge text-sub hover:border-brand hover:text-brand"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => apply({ label: "reset", b: 0.02, x: 10000 })}
        className="rounded-sm border border-edge px-2.5 py-1 font-mono text-[11px] text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        reset
      </button>
      <span className="ml-auto font-mono text-[10px] text-muted">
        now: {usd0(moveX)} @ ≤{pct(budget, budget < 0.01 ? 2 : 1)}
      </span>
    </div>
  );
}
