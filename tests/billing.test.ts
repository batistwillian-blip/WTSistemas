import { describe, expect, it } from "vitest";
import { missingMonths, planSeries, settle, splitInstallments } from "@/lib/billing";

describe("parcelas", () => {
  it("divide o total e põe a sobra na primeira", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it("gera parcelada com (k/N) e vencimentos mensais", () => {
    const p = planSeries({ mode: "parcelada", amount: 30000, dueDate: "2026-01-31", description: "Notebook", count: 3, amountIsTotal: true });
    expect(p.map((x) => x.description)).toEqual(["Notebook (1/3)", "Notebook (2/3)", "Notebook (3/3)"]);
    expect(p.map((x) => x.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(p.map((x) => x.amount)).toEqual([10000, 10000, 10000]);
  });

  it("parcelada com valor por parcela não divide", () => {
    const p = planSeries({ mode: "parcelada", amount: 5000, dueDate: "2026-01-10", description: "X", count: 4, amountIsTotal: false });
    expect(p.every((x) => x.amount === 5000)).toBe(true);
  });

  it("fixa mensal repete o mesmo valor e descrição", () => {
    const p = planSeries({ mode: "mensal", amount: 150000, dueDate: "2026-11-05", description: "Aluguel", count: 12 });
    expect(p).toHaveLength(12);
    expect(p[11]).toEqual({ dueDate: "2027-10-05", amount: 150000, description: "Aluguel" });
  });
});

describe("baixa", () => {
  it("pagamento exato quita", () => {
    expect(settle({ open: 10000, paid: 10000, interest: 0, discount: 0, partial: false })).toMatchObject({ kind: "total", remaining: 0 });
  });

  it("juros e desconto entram no valor pago", () => {
    expect(settle({ open: 10000, paid: 10500, interest: 500, discount: 0, partial: false })).toMatchObject({ kind: "total", interest: 500 });
    expect(settle({ open: 10000, paid: 9000, interest: 0, discount: 1000, partial: false })).toMatchObject({ kind: "total", discount: 1000 });
  });

  it("pago acima do devido vira juros", () => {
    expect(settle({ open: 10000, paid: 10300, interest: 0, discount: 0, partial: false })).toMatchObject({ kind: "total", interest: 300, principal: 10000 });
  });

  it("pago a menor exige marcar parcial e deixa o restante", () => {
    expect(settle({ open: 10000, paid: 4000, interest: 0, discount: 0, partial: false })).toHaveProperty("error");
    expect(settle({ open: 10000, paid: 4000, interest: 0, discount: 0, partial: true })).toMatchObject({ kind: "parcial", principal: 4000, remaining: 6000 });
  });

  it("recusa valores inválidos", () => {
    expect(settle({ open: 10000, paid: 0, interest: 0, discount: 0, partial: true })).toHaveProperty("error");
    expect(settle({ open: 10000, paid: 100, interest: 200, discount: 0, partial: true })).toHaveProperty("error");
    expect(settle({ open: 10000, paid: 100, interest: 0, discount: 10000, partial: true })).toHaveProperty("error");
  });
});

describe("conta fixa sem fim", () => {
  it("gera só os meses que faltam até o horizonte, no dia do primeiro vencimento", () => {
    expect(missingMonths("2026-01-31", "2026-03-31", "2026-06-15")).toEqual(["2026-04-30", "2026-05-31"]);
    expect(missingMonths("2026-01-10", "2026-12-10", "2026-12-31")).toEqual([]);
  });
});
