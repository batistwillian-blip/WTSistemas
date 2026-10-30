export type BarSeries = { name: string; color: string; values: number[] };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" → "out/26"; outros rótulos passam direto. */
export function monthLabel(m: string) {
  return /^\d{4}-\d{2}$/.test(m) ? `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}` : m;
}

function short(cents: number) {
  const v = cents / 100;
  const a = Math.abs(v);
  if (a >= 1000) return (a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: a >= 100000 ? 0 : 1 }) + " mil";
  return a.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function niceMax(v: number) {
  if (v <= 0) return 100;
  const mag = 10 ** Math.floor(Math.log10(v));
  const f = v / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

/** Barras agrupadas em SVG gerado no servidor. Valores em centavos. `highlight` destaca uma categoria (ex.: o mês atual). */
export function BarChart({ labels, series, height = 240, highlight }: { labels: string[]; series: BarSeries[]; height?: number; highlight?: number }) {
  const W = 760;
  const H = height;
  const pad = { l: 56, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / Math.max(1, labels.length);
  const gap = Math.min(10, slot * 0.2);
  const bw = Math.max(2, (slot - gap) / series.length);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.ceil(labels.length / 12);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(", ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {short(t)}
            </text>
          </g>
        ))}
        {highlight !== undefined && highlight >= 0 && (
          <rect x={pad.l + highlight * slot} y={pad.t} width={slot} height={ih} fill="var(--sunk)" />
        )}
        {labels.map((l, i) =>
          series.map((s, j) => {
            const v = s.values[i] ?? 0;
            return (
              <rect key={`${i}-${j}`} x={pad.l + i * slot + gap / 2 + j * bw} y={y(v)} width={bw - 1} height={Math.max(0, pad.t + ih - y(v))} rx={2} fill={s.color}>
                <title>{`${s.name} · ${monthLabel(l)}: ${(v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}</title>
              </rect>
            );
          }),
        )}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <text key={l} x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {monthLabel(l)}
            </text>
          ) : null,
        )}
      </svg>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <span className="sw" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
