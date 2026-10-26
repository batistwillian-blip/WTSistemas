import { addDays, addMonths, isValidIsoDate, monthEnd, monthStart, today } from "./format";

function param(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export type Period = { from: string; to: string; preset: string | null };

/** Atalhos de período usados nos relatórios e nas vendas. */
export function presets(d0 = today()) {
  const m0 = monthStart(d0);
  return [
    { key: "mes", label: "Este mês", from: m0, to: monthEnd(d0) },
    { key: "mes-passado", label: "Mês passado", from: addMonths(m0, -1), to: addDays(m0, -1) },
    { key: "3-meses", label: "Últimos 3 meses", from: addMonths(m0, -2), to: monthEnd(d0) },
    { key: "ano", label: "Este ano", from: `${d0.slice(0, 4)}-01-01`, to: `${d0.slice(0, 4)}-12-31` },
    { key: "12-meses", label: "Últimos 12 meses", from: addMonths(m0, -11), to: monthEnd(d0) },
  ];
}

/** Lê ?de=&ate= (ou ?mes=AAAA-MM). Sem nada, usa o mês atual. */
export function readPeriod(sp: Record<string, string | string[] | undefined>): Period {
  const de = param(sp, "de");
  const ate = param(sp, "ate");
  if (de && ate && isValidIsoDate(de) && isValidIsoDate(ate) && de <= ate) {
    const p = presets().find((x) => x.from === de && x.to === ate);
    return { from: de, to: ate, preset: p?.key ?? null };
  }
  const mes = param(sp, "mes");
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { from: `${mes}-01`, to: monthEnd(`${mes}-01`), preset: null };
  const p = presets()[0];
  return { from: p.from, to: p.to, preset: p.key };
}

/** Período anterior com a mesma duração, para comparar. */
export function previousPeriod(p: Period, d0 = today()): Period {
  const fullMonths = p.from.slice(8) === "01" && p.to === monthEnd(p.to);
  if (fullMonths) {
    const months = (Number(p.to.slice(0, 4)) - Number(p.from.slice(0, 4))) * 12 + Number(p.to.slice(5, 7)) - Number(p.from.slice(5, 7)) + 1;
    const from = addMonths(p.from, -months);
    // Período em andamento (ex.: este mês): compara até o mesmo dia, para não comparar mês pela metade com mês inteiro.
    if (p.from <= d0 && d0 < p.to) return { from, to: addMonths(d0, -months), preset: null };
    return { from, to: addDays(p.from, -1), preset: null };
  }
  const days = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000) + 1;
  return { from: addDays(p.from, -days), to: addDays(p.from, -1), preset: null };
}

/** Lista de meses AAAA-MM de from até to (inclusive). */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push(m.slice(0, 7));
  return out;
}
