import { formatDate, formatMoney } from "@/lib/format";

type Point = { date: string; balance: number };

/** Gráfico de linha do saldo, desenhado em SVG no servidor (sem bibliotecas externas). */
export function LineChart({ points, height = 220 }: { points: Point[]; height?: number }) {
  if (points.length < 2) return null;
  const width = 800;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const values = points.map((p) => p.balance);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (height - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const minIdx = values.indexOf(Math.min(...values));
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const anyNegative = min < 0;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolução do saldo projetado">
        <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} stroke="#d0d5dd" strokeDasharray="4 4" />
        {anyNegative && (
          <rect x={pad.l} y={y(0)} width={width - pad.l - pad.r} height={Math.max(0, height - pad.b - y(0))} fill="#fef3f2" />
        )}
        <path d={d} fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(minIdx)} cy={y(values[minIdx])} r="4" fill={values[minIdx] < 0 ? "#b42318" : "#1d4ed8"}>
          <title>{`Menor saldo: ${formatMoney(values[minIdx])} em ${formatDate(points[minIdx].date)}`}</title>
        </circle>
        {ticks.map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={height - 6}
            fontSize="12"
            fill="#667085"
            textAnchor={k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle"}
          >
            {formatDate(points[i].date).slice(0, 5)}
          </text>
        ))}
      </svg>
    </div>
  );
}
