import { addDays, addMonths, monthEnd, today } from "./format";

/** Filtros da tela de contas a pagar/receber, lidos da URL. Sem nada: mês atual, todas as situações, por vencimento. */
export type BillStatus = "todas" | "aberto" | "vencidas" | "pagas";
export type BillBase = "vencimento" | "pagamento" | "competencia";
export type BillFilters = {
  month: string | "todas";
  status: BillStatus;
  base: BillBase;
  category: string;
  account: number | null;
  q: string;
};

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

export function readBillFilters(sp: SP, d0 = today()): BillFilters {
  const rawStatus = one(sp, "situacao");
  // "pagas" é o nome antigo da aba; continua valendo.
  const status: BillStatus = rawStatus === "aberto" || rawStatus === "vencidas" || rawStatus === "pagas" ? rawStatus : "todas";
  const rawMonth = one(sp, "mes");
  // "Todos os meses" só para o que está em aberto ou vencido (pagas de todos os tempos seriam milhares de linhas).
  const month =
    rawMonth === "todas" && (status === "aberto" || status === "vencidas")
      ? "todas"
      : /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth)
        ? rawMonth
        : d0.slice(0, 7);
  const rawBase = one(sp, "ver");
  return {
    month,
    status,
    base: rawBase === "pagamento" || rawBase === "competencia" ? rawBase : "vencimento",
    category: one(sp, "categoria").slice(0, 100),
    account: /^\d+$/.test(one(sp, "conta")) ? Number(one(sp, "conta")) : null,
    q: one(sp, "q").trim().slice(0, 100),
  };
}

/** Intervalo de datas a buscar para os filtros. */
export function billRange(f: BillFilters, d0 = today()): { from: string; to: string } {
  if (f.month === "todas") return { from: "1900-01-01", to: f.status === "vencidas" ? addDays(d0, -1) : "2999-12-31" };
  return { from: `${f.month}-01`, to: monthEnd(`${f.month}-01`) };
}

export function monthNav(month: string): { prev: string; next: string } {
  return { prev: addMonths(`${month}-01`, -1).slice(0, 7), next: addMonths(`${month}-01`, 1).slice(0, 7) };
}

export type BillRow = {
  id: number;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  competence: string | null;
  offBalance: boolean;
  description: string;
  counterpart: string | null;
  document: string | null;
  categoryName: string | null;
  externalCategory: string | null;
  accountId: number;
};

export type Situation = "paga" | "vencida" | "hoje" | "aberta";

export function situation(r: Pick<BillRow, "paidAt" | "dueDate">, d0 = today()): Situation {
  if (r.paidAt) return "paga";
  if (r.dueDate < d0) return "vencida";
  if (r.dueDate === d0) return "hoje";
  return "aberta";
}

export const categoryOf = (r: Pick<BillRow, "categoryName" | "externalCategory">) => r.categoryName ?? r.externalCategory ?? "Sem categoria";

/** Data que posiciona a conta na lista, conforme o "ver por". */
export function dateOf(r: BillRow, base: BillBase): string {
  if (base === "pagamento") return r.paidAt ?? r.dueDate;
  if (base === "competencia") return r.competence ?? r.dueDate.slice(0, 8) + "01";
  return r.dueDate;
}

/** Aplica situação, categoria, conta e busca (descrição, cliente/fornecedor ou nº do documento). */
export function applyFilters<T extends BillRow>(rows: T[], f: BillFilters, d0 = today()): T[] {
  const q = f.q.toLocaleLowerCase("pt-BR");
  return rows.filter((r) => {
    const s = situation(r, d0);
    if (f.status === "pagas" && s !== "paga") return false;
    if (f.status === "aberto" && s === "paga") return false;
    if (f.status === "vencidas" && s !== "vencida") return false;
    if (f.category && categoryOf(r) !== f.category) return false;
    if (f.account && r.accountId !== f.account) return false;
    if (q && ![r.description, r.counterpart, r.document].some((v) => v?.toLocaleLowerCase("pt-BR").includes(q))) return false;
    return true;
  });
}

/** Totais do mês: previsto (tudo), pago, em aberto e vencido. Contas "só consulta" do CH ficam à parte. */
export function summarize(rows: BillRow[], d0 = today()) {
  const counted = rows.filter((r) => !r.offBalance);
  const sum = (l: BillRow[]) => l.reduce((s, r) => s + r.amount, 0);
  const paid = counted.filter((r) => r.paidAt);
  const open = counted.filter((r) => !r.paidAt);
  const overdue = open.filter((r) => r.dueDate < d0);
  const consult = rows.filter((r) => r.offBalance);
  return {
    total: sum(counted),
    totalCount: counted.length,
    paid: sum(paid),
    paidCount: paid.length,
    open: sum(open),
    openCount: open.length,
    overdue: sum(overdue),
    overdueCount: overdue.length,
    consult: sum(consult),
    consultCount: consult.length,
  };
}

/** Por categoria, do maior para o menor. */
export function byCategory(rows: BillRow[]) {
  const m = new Map<string, number>();
  for (const r of rows) if (!r.offBalance) m.set(categoryOf(r), (m.get(categoryOf(r)) ?? 0) + r.amount);
  return [...m.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}

/** Agrupa por semana (segunda a domingo), na ordem das datas. Na competência (sempre dia 1), agrupa pelo vencimento. */
export function weekGroups<T extends BillRow>(rows: T[], viewBase: BillBase) {
  const base = viewBase === "competencia" ? "vencimento" : viewBase;
  const groups = new Map<string, { start: string; end: string; rows: T[] }>();
  for (const r of [...rows].sort((a, b) => dateOf(a, base).localeCompare(dateOf(b, base)) || a.id - b.id)) {
    const d = dateOf(r, base);
    const dow = (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7;
    const start = addDays(d, -dow);
    const g = groups.get(start) ?? { start, end: addDays(start, 6), rows: [] };
    g.rows.push(r);
    groups.set(start, g);
  }
  return [...groups.values()];
}

/** Célula de CSV segura: aspas escapadas e sem fórmula (texto começando com = + - @ vira texto puro no Excel). */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
