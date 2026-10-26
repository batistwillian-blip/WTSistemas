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
