// Funções puras de formatação e datas. Datas de negócio são strings "AAAA-MM-DD".

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatMoney(cents: number): string {
  return brl.format(cents / 100);
}

/** Converte "1.234,56", "1234.56", "1234" ou "R$ 10,5" em centavos. Retorna null se inválido. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  const value = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Data de hoje no fuso de São Paulo, em "AAAA-MM-DD". */
export function today(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Soma meses mantendo o dia; se o mês não tiver o dia (ex.: 31), usa o último dia do mês. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromUtc(target);
}

export function monthStart(iso: string): string {
  return iso.slice(0, 8) + "01";
}

export function monthEnd(iso: string): string {
  return addDays(addMonths(monthStart(iso), 1), -1);
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUtc(toUtc(s)) === s;
}
