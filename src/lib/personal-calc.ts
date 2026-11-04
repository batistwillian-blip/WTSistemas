/** Cálculos da área Pessoal (sem banco, testáveis). */
export type PersonalRow = {
  id: number;
  type: "entrada" | "saida";
  amount: number;
  dueDate: string;
  paidAt: string | null;
  categoryId: number | null;
  categoryName: string | null;
  withdrawalAccountId: number | null;
  sourceCompany: string | null;
  sourceColor: string | null;
};


/** Totais do mês: renda (entradas + gastos pagos pelas empresas), gastos (pagos e a pagar) e sobra. */
export function monthSummary(rows: PersonalRow[]) {
  const sum = (l: PersonalRow[]) => l.reduce((s, r) => s + r.amount, 0);
  const out = rows.filter((r) => r.type === "saida");
  const inc = rows.filter((r) => r.type === "entrada");
  const viaCompany = sum(out.filter((r) => r.withdrawalAccountId));
  const income = sum(inc) + viaCompany;
  const spent = sum(out);
  return {
    income,
    ownIncome: sum(inc),
    viaCompany,
    spent,
    spentPaid: sum(out.filter((r) => r.paidAt)),
    spentOpen: sum(out.filter((r) => !r.paidAt)),
    left: income - spent,
    savedPct: income > 0 ? Math.round(((income - spent) / income) * 100) : null,
  };
}

/** Quanto saiu de cada empresa no mês (gastos pagos por ela + retiradas recebidas). */
export function bySourceCompany(rows: PersonalRow[]) {
  const m = new Map<string, { name: string; color: string; total: number; n: number }>();
  for (const r of rows) {
    if (!r.sourceCompany) continue;
    const cur = m.get(r.sourceCompany) ?? { name: r.sourceCompany, color: r.sourceColor ?? "#888", total: 0, n: 0 };
    cur.total += r.amount;
    cur.n += 1;
    m.set(r.sourceCompany, cur);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/** Gasto por categoria contra o orçamento: % usado e nível de alerta (80% = atenção, 100% = estourou). */
export function budgetStatus(rows: PersonalRow[], budgets: { categoryId: number; amount: number }[], names: Map<number, string>) {
  const spent = new Map<string, { id: number | null; name: string; total: number }>();
  for (const r of rows) {
    if (r.type !== "saida") continue;
    const key = String(r.categoryId ?? "none");
    const cur = spent.get(key) ?? { id: r.categoryId, name: r.categoryName ?? "Sem categoria", total: 0 };
    cur.total += r.amount;
    spent.set(key, cur);
  }
  // Categorias com orçamento aparecem mesmo sem gasto no mês.
  for (const b of budgets) if (!spent.has(String(b.categoryId))) spent.set(String(b.categoryId), { id: b.categoryId, name: names.get(b.categoryId) ?? "?", total: 0 });
  const limit = new Map(budgets.map((b) => [b.categoryId, b.amount]));
  return [...spent.values()]
    .map((c) => {
      const budget = c.id !== null ? (limit.get(c.id) ?? null) : null;
      const pct = budget ? Math.round((c.total / budget) * 100) : null;
      const level: "ok" | "warn" | "over" | null = pct === null ? null : pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok";
      return { ...c, budget, pct, level };
    })
    .sort((a, b) => b.total - a.total || (b.budget ?? 0) - (a.budget ?? 0));
}
