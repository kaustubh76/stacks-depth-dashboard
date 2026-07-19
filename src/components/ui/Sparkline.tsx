// Tiny dependency-free sparkline. Stretches to its container width (preserveAspectRatio
// none) so it can grow as a live series accumulates. Renders nothing until 2+ points.

export default function Sparkline({
  data,
  color = "#38b2c4",
  height = 30,
  strokeWidth = 1.5,
  fill = true,
}: {
  data: number[];
  color?: string;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
}) {
  if (data.length < 2) {
    return (
      <div className="flex h-[30px] items-center font-mono text-[10px] text-muted" style={{ height }}>
        collecting…
      </div>
    );
  }
  const W = 100;
  const H = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => H - 1 - ((v - min) / range) * (H - 2);
  const pts = data.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const last = data[data.length - 1];
  const rising = data[data.length - 1] >= data[0];
  const stroke = color === "auto" ? (rising ? "#43b581" : "#e0728a") : color;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block overflow-visible">
      {fill && (
        <polygon
          points={`0,${H} ${pts} ${W},${H}`}
          fill={stroke}
          opacity={0.1}
        />
      )}
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(data.length - 1)} cy={y(last)} r={2} fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
