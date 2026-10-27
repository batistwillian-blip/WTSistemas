// Regras financeiras puras (sem banco), fáceis de testar.
import { addDays } from "./format";

export type PendingItem = { dueDate: string; type: "entrada" | "saida"; amount: number };

export type ProjectionPoint = { date: string; balance: number; inflow: number; outflow: number };

export type Projection = {
  points: ProjectionPoint[];
  endBalance: number;
  minBalance: number;
  minDate: string;
  overdueIn: number;
  overdueOut: number;
};

export function signed(item: { type: "entrada" | "saida"; amount: number }): number {
  return item.type === "entrada" ? item.amount : -item.amount;
}

/**
 * Projeta o saldo dia a dia a partir do saldo realizado de hoje.
 * Itens vencidos e ainda pendentes entram no dia de hoje (pior cenário: tudo acontece já).
 */
export function project(startBalance: number, items: PendingItem[], from: string, days: number): Projection {
  const end = addDays(from, days);
  const byDay = new Map<string, { inflow: number; outflow: number }>();
  let overdueIn = 0;
  let overdueOut = 0;
  for (const it of items) {
    if (it.dueDate > end) continue;
    const day = it.dueDate < from ? from : it.dueDate;
    if (it.dueDate < from) {
      if (it.type === "entrada") overdueIn += it.amount;
      else overdueOut += it.amount;
    }
    const slot = byDay.get(day) ?? { inflow: 0, outflow: 0 };
    if (it.type === "entrada") slot.inflow += it.amount;
    else slot.outflow += it.amount;
    byDay.set(day, slot);
  }
  const points: ProjectionPoint[] = [];
  let balance = startBalance;
  let minBalance = Infinity;
  let minDate = from;
  for (let i = 0; i <= days; i++) {
    const date = addDays(from, i);
    const slot = byDay.get(date) ?? { inflow: 0, outflow: 0 };
    balance += slot.inflow - slot.outflow;
    points.push({ date, balance, inflow: slot.inflow, outflow: slot.outflow });
    if (balance < minBalance) {
      minBalance = balance;
      minDate = date;
    }
  }
  return { points, endBalance: balance, minBalance, minDate, overdueIn, overdueOut };
}

export type TransferLike = {
  nature: "emprestimo" | "devolucao" | "aporte" | "transferencia";
  fromCompanyId: number;
  toCompanyId: number;
  amount: number;
};

export type Debt = { debtorId: number; creditorId: number; amount: number };

/**
 * Quem deve a quem: empréstimo de A para B faz B dever a A; devolução de B para A abate essa dívida.
 * Aportes e transferências simples não geram dívida.
 */
export function intercompanyDebts(list: TransferLike[]): Debt[] {
  const net = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const t of list) {
    if (t.nature !== "emprestimo" && t.nature !== "devolucao") continue;
    // Para o par (menor, maior), positivo = maior deve ao menor.
    const [lo, hi] = t.fromCompanyId < t.toCompanyId ? [t.fromCompanyId, t.toCompanyId] : [t.toCompanyId, t.fromCompanyId];
    const k = key(lo, hi);
    // Empréstimo de X para Y: Y passa a dever a X. Devolução de X para Y: a dívida de X com Y diminui.
    const creditor = t.nature === "emprestimo" ? t.fromCompanyId : t.toCompanyId;
    const towardCreditor = creditor === lo ? t.amount : -t.amount;
    const delta = t.nature === "emprestimo" ? towardCreditor : -towardCreditor;
    net.set(k, (net.get(k) ?? 0) + delta);
  }
  const out: Debt[] = [];
  for (const [k, v] of net) {
    if (v === 0) continue;
    const [lo, hi] = k.split(":").map(Number);
    out.push(v > 0 ? { debtorId: hi, creditorId: lo, amount: v } : { debtorId: lo, creditorId: hi, amount: -v });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

export type MonthClose = {
  monthEnd: string;
  receive: number;
  pay: number;
  endBalance: number;
  /** Quanto falta entrar (além do já previsto) para terminar o mês com saldo zero ou positivo. */
  shortfall: number;
  /** Menor saldo até o fim do mês e o dia em que acontece. */
  minBalance: number;
  minDate: string;
  daysLeft: number;
  overdueIn: number;
  overdueOut: number;
};

/** Fechamento do mês: o que ainda entra e sai até o último dia do mês (vencidos contam como hoje). */
export function monthClose(balance: number, items: PendingItem[], d0: string, monthEnd: string): MonthClose {
  const inMonth = items.filter((i) => i.dueDate <= monthEnd);
  const receive = inMonth.filter((i) => i.type === "entrada").reduce((s, i) => s + i.amount, 0);
  const pay = inMonth.filter((i) => i.type === "saida").reduce((s, i) => s + i.amount, 0);
  const days = Math.round((Date.parse(monthEnd) - Date.parse(d0)) / 86_400_000);
  const proj = project(balance, inMonth, d0, days);
  const endBalance = balance + receive - pay;
  return {
    monthEnd,
    receive,
    pay,
    endBalance,
    shortfall: endBalance < 0 ? -endBalance : 0,
    minBalance: proj.minBalance,
    minDate: proj.minDate,
    daysLeft: days + 1,
    overdueIn: proj.overdueIn,
    overdueOut: proj.overdueOut,
  };
}

export type WeekBucket = { from: string; to: string; inflow: number; outflow: number; endBalance: number };

/** Semanas de segunda a domingo a partir de hoje (a primeira vai de hoje até domingo; vencidos entram nela). */
export function weekBuckets(balance: number, items: PendingItem[], d0: string, weeks: number): WeekBucket[] {
  const out: WeekBucket[] = [];
  const dow = new Date(d0 + "T12:00:00Z").getUTCDay(); // 0 = domingo
  let from = d0;
  let to = addDays(d0, dow === 0 ? 0 : 7 - dow);
  let running = balance;
  for (let w = 0; w < weeks; w++) {
    const inWeek = items.filter((i) => (w === 0 ? i.dueDate <= to : i.dueDate >= from && i.dueDate <= to));
    const inflow = inWeek.filter((i) => i.type === "entrada").reduce((s, i) => s + i.amount, 0);
    const outflow = inWeek.filter((i) => i.type === "saida").reduce((s, i) => s + i.amount, 0);
    running += inflow - outflow;
    out.push({ from, to, inflow, outflow, endBalance: running });
    from = addDays(to, 1);
    to = addDays(from, 6);
  }
  return out;
}
