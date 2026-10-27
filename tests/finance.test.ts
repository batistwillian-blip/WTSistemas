import { describe, expect, it } from "vitest";
import { intercompanyDebts, project } from "@/lib/finance";

describe("project", () => {
  it("projeta saldo e acha o menor ponto", () => {
    const p = project(
      1000_00,
      [
        { dueDate: "2026-10-20", type: "saida", amount: 200_00 }, // vencido: entra hoje
        { dueDate: "2026-10-28", type: "saida", amount: 1500_00 },
        { dueDate: "2026-11-05", type: "entrada", amount: 2000_00 },
        { dueDate: "2027-01-01", type: "entrada", amount: 999_00 }, // fora da janela
      ],
      "2026-10-26",
      30,
    );
    expect(p.points[0].balance).toBe(800_00);
    expect(p.overdueOut).toBe(200_00);
    expect(p.minBalance).toBe(-700_00);
    expect(p.minDate).toBe("2026-10-28");
    expect(p.endBalance).toBe(1300_00);
    expect(p.points).toHaveLength(31);
  });
});

describe("intercompanyDebts", () => {
  it("empréstimo gera dívida e devolução abate", () => {
    const debts = intercompanyDebts([
      { nature: "emprestimo", fromCompanyId: 1, toCompanyId: 2, amount: 5000_00 },
      { nature: "devolucao", fromCompanyId: 2, toCompanyId: 1, amount: 2000_00 },
      { nature: "aporte", fromCompanyId: 3, toCompanyId: 1, amount: 9999_00 },
      { nature: "emprestimo", fromCompanyId: 3, toCompanyId: 2, amount: 100_00 },
    ]);
    expect(debts).toEqual([
      { debtorId: 2, creditorId: 1, amount: 3000_00 },
      { debtorId: 2, creditorId: 3, amount: 100_00 },
    ]);
  });
  it("empréstimos nos dois sentidos se compensam", () => {
    const debts = intercompanyDebts([
      { nature: "emprestimo", fromCompanyId: 2, toCompanyId: 1, amount: 100_00 },
      { nature: "emprestimo", fromCompanyId: 1, toCompanyId: 2, amount: 300_00 },
    ]);
    expect(debts).toEqual([{ debtorId: 2, creditorId: 1, amount: 200_00 }]);
  });
  it("dívida quitada some da lista", () => {
    expect(
      intercompanyDebts([
        { nature: "emprestimo", fromCompanyId: 1, toCompanyId: 2, amount: 100 },
        { nature: "devolucao", fromCompanyId: 2, toCompanyId: 1, amount: 100 },
      ]),
    ).toEqual([]);
  });
});

import { monthClose, weekBuckets } from "@/lib/finance";

describe("fechamento do mês", () => {
  const items = [
    { dueDate: "2026-10-20", type: "saida" as const, amount: 30000 }, // vencida
    { dueDate: "2026-10-29", type: "entrada" as const, amount: 20000 },
    { dueDate: "2026-10-30", type: "saida" as const, amount: 50000 },
    { dueDate: "2026-11-05", type: "entrada" as const, amount: 90000 }, // fora do mês
  ];
  it("soma só o que vence até o fim do mês e diz quanto falta", () => {
    const m = monthClose(40000, items, "2026-10-27", "2026-10-31");
    expect(m.receive).toBe(20000);
    expect(m.pay).toBe(80000);
    expect(m.endBalance).toBe(-20000);
    expect(m.shortfall).toBe(20000);
    expect(m.minBalance).toBe(-20000);
    expect(m.minDate).toBe("2026-10-30");
    expect(m.daysLeft).toBe(5);
    expect(m.overdueOut).toBe(30000);
  });
  it("sem falta quando fecha no verde", () => {
    expect(monthClose(100000, items, "2026-10-27", "2026-10-31").shortfall).toBe(0);
  });
  it("semanas de segunda a domingo", () => {
    const w = weekBuckets(40000, items, "2026-10-27", 2); // terça
    expect(w[0]).toMatchObject({ from: "2026-10-27", to: "2026-11-01", inflow: 20000, outflow: 80000, endBalance: -20000 });
    expect(w[1]).toMatchObject({ from: "2026-11-02", to: "2026-11-08", inflow: 90000, endBalance: 70000 });
  });
});
