import { formatMoney } from "@/lib/format";

export type Series = { name: string; color: string; points: { date: string; balance: number }[]; width?: number; area?: boolean };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function ticks(min: number, max: number, count = 5) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) out.push(Math.round(v));
  return out;
}

/** Valor curto para o eixo: "12 mil", "−3,5 mil". Recebe centavos. */
function short(cents: number) {
  const v = cents / 100;
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1000) return s + (a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: a >= 100000 ? 0 : 1 }) + " mil";
  return s + a.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Gráfico de linhas do saldo, em SVG gerado no servidor (sem bibliotecas externas). */
export function LineChart({ series, height = 260 }: { series: Series[]; height?: number }) {
  const pts = series[0]?.points ?? [];
  const n = pts.length;
  if (n < 2) return null;
  const W = 820;
  const m = { l: 60, r: 16, t: 12, b: 28 };
  let min = 0;
  let max = 0;
  for (const s of series) for (const p of s.points) {
    if (p.balance < min) min = p.balance;
    if (p.balance > max) max = p.balance;
  }
  const tk = ticks(min, max);
  const a = tk[0];
  const b = tk[tk.length - 1];
  const iw = W - m.l - m.r;
  const ih = height - m.t - m.b;
  const X = (i: number) => m.l + (iw * i) / (n - 1);
  const Y = (v: number) => m.t + ih * (1 - (v - a) / (b - a || 1));

  // Rótulos do eixo X: "Hoje", primeiro dia de cada mês e o último dia, sem sobreposição.
  const candidates = pts.map((p, i) => i).filter((i) => i === 0 || pts[i].date.endsWith("-01"));
  const labels: number[] = [];
  for (const i of candidates) if (!labels.length || X(i) - X(labels[labels.length - 1]) > 60) labels.push(i);
  if (X(n - 1) - X(labels[labels.length - 1]) > 70) labels.push(n - 1);
  const label = (i: number) => (i === 0 ? "Hoje" : `${pts[i].date.slice(8, 10)} ${MONTHS[Number(pts[i].date.slice(5, 7)) - 1]}`);

  return (
    <div className="chart">
      <div className="legend">
        {series.map((s) => {
          const last = s.points[s.points.length - 1].balance;
          return (
            <span key={s.name}>
              <span className="sw" style={{ background: s.color }} />
              {s.name}: <b className={`num ${last < 0 ? "neg" : ""}`}>{formatMoney(last)}</b>
            </span>
          );
        })}
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Saldo projetado nos próximos ${n - 1} dias`}>
        {tk.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} className={t === 0 && min < 0 ? "zero" : "grid-l"} />
            <text x={m.l - 8} y={Y(t) + 4} textAnchor="end" className="ax">
              {short(t)}
            </text>
          </g>
        ))}
        {labels.map((i) => (
          <text key={i} x={X(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="ax">
            {label(i)}
          </text>
        ))}
        {series.map((s) => {
          const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.balance).toFixed(1)}`).join(" ");
          const base = Y(Math.max(a, 0));
          const last = s.points[n - 1];
          return (
            <g key={s.name}>
              {s.area && <path d={`${d} L${X(n - 1)} ${base} L${X(0)} ${base} Z`} style={{ fill: s.color, opacity: 0.1 }} />}
              <path d={d} style={{ fill: "none", stroke: s.color, strokeWidth: s.width ?? 2, strokeLinejoin: "round" }}>
                <title>{s.name}</title>
              </path>
              <circle cx={X(n - 1)} cy={Y(last.balance)} r={(s.width ?? 2) > 2 ? 4 : 3} style={{ fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
