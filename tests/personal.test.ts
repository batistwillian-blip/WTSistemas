import { describe, expect, it } from "vitest";
import { budgetStatus, bySourceCompany, monthSummary, type PersonalRow } from "@/lib/personal-calc";

const row = (p: Partial<PersonalRow>): PersonalRow => ({
  id: 1,
  type: "saida",
  amount: 0,
  dueDate: "2026-11-10",
  paidAt: null,
  categoryId: null,
  categoryName: null,
  withdrawalAccountId: null,
  sourceCompany: null,
  sourceColor: null,
  ...p,
});

describe("área pessoal", () => {
  const rows = [
    row({ type: "entrada", amount: 500000, categoryId: 10, categoryName: "Pró-labore", paidAt: "2026-11-05" }),
    row({ amount: 150000, categoryId: 1, categoryName: "Mercado", paidAt: "2026-11-06" }),
    row({ amount: 90000, categoryId: 2, categoryName: "Lazer" }),
    row({ amount: 200000, categoryId: 3, categoryName: "Escola", withdrawalAccountId: 7, sourceCompany: "Aura Educa", sourceColor: "#00f" }),
    row({ type: "entrada", amount: 100000, withdrawalAccountId: 8, sourceCompany: "PrimeTech Sistemas", sourceColor: "#f00" }),
  ];
  it("renda conta os gastos pagos pelas empresas; sobra = renda − gastos", () => {
    const s = monthSummary(rows);
    expect(s.ownIncome).toBe(600000);
    expect(s.viaCompany).toBe(200000);
    expect(s.income).toBe(800000);
    expect(s.spent).toBe(440000);
    expect(s.spentPaid).toBe(150000);
    expect(s.left).toBe(360000);
    expect(s.savedPct).toBe(45);
  });
  it("quanto saiu de cada empresa", () => {
    expect(bySourceCompany(rows).map((c) => [c.name, c.total])).toEqual([
      ["Aura Educa", 200000],
      ["PrimeTech Sistemas", 100000],
    ]);
  });
  it("orçamento: 80% avisa, 100% estourou, categoria com orçamento aparece mesmo sem gasto", () => {
    const st = budgetStatus(
      rows,
      [
        { categoryId: 1, amount: 150000 },
        { categoryId: 2, amount: 100000 },
        { categoryId: 4, amount: 50000 },
      ],
      new Map([[4, "Roupas"]]),
    );
    const by = Object.fromEntries(st.map((s) => [s.name, s]));
    expect(by["Mercado"].level).toBe("over");
    expect(by["Lazer"].level).toBe("warn");
    expect(by["Roupas"]).toMatchObject({ total: 0, level: "ok" });
    expect(by["Escola"].level).toBeNull();
  });
});
