import { describe, expect, it } from "vitest";
import { competenceOf, installmentLabel, missingMonths, parsePlan, planSeries, settle, splitInstallments, SYSTEM_DOC, systemDocument } from "@/lib/billing";

describe("parcelas", () => {
  it("divide o total e põe a sobra na primeira", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it("gera parcelada com nº da parcela, vencimentos e competências mensais", () => {
    const p = planSeries({ mode: "parcelada", amount: 30000, dueDate: "2026-01-31", competence: "2026-01-01", count: 3, amountIsTotal: true });
    expect(p.map(installmentLabel)).toEqual(["1/3", "2/3", "3/3"]);
    expect(p.map((x) => x.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(p.map((x) => x.competence)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(p.map((x) => x.amount)).toEqual([10000, 10000, 10000]);
  });

  it("parcelada com valor por parcela não divide", () => {
    const p = planSeries({ mode: "parcelada", amount: 5000, dueDate: "2026-01-10", competence: "2026-01-01", count: 4, amountIsTotal: false });
    expect(p.every((x) => x.amount === 5000)).toBe(true);
  });

  it("fixa mensal repete o mesmo valor e numera 1/12…12/12", () => {
    const p = planSeries({ mode: "mensal", amount: 150000, dueDate: "2026-11-05", competence: "2026-10-01", count: 12 });
    expect(p).toHaveLength(12);
    expect(p[11]).toEqual({ dueDate: "2027-10-05", competence: "2027-09-01", amount: 150000, installment: 12, installments: 12 });
  });

  it("fixa sem fim numera sem total", () => {
    const p = planSeries({ mode: "mensal", amount: 100, dueDate: "2026-11-05", competence: "2026-11-01", count: 12, openEnded: true });
    expect(installmentLabel(p[4])).toBe("5ª");
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

describe("documento e competência", () => {
  it("numeração do sistema é A + 5 dígitos e se distingue de NF", () => {
    expect(systemDocument(1)).toBe("A00001");
    expect(systemDocument(123456)).toBe("A123456");
    expect(SYSTEM_DOC.test("A00042")).toBe(true);
    expect(SYSTEM_DOC.test("5431")).toBe(false);
    expect(SYSTEM_DOC.test("A12")).toBe(false);
  });

  it("competência vira o dia 1 do mês", () => {
    expect(competenceOf("2026-10")).toBe("2026-10-01");
    expect(competenceOf("2026-10-17")).toBe("2026-10-01");
    expect(competenceOf("2026-13")).toBeNull();
    expect(competenceOf("")).toBeNull();
  });
});

describe("plano de parcelas", () => {
  it("de 15 em 15 dias, com competência acompanhando o mês", () => {
    const p = planSeries({ mode: "parcelada", amount: 4000, dueDate: "2026-11-10", competence: "2026-11-01", count: 4, amountIsTotal: true, everyDays: 15 });
    expect(p.map((x) => x.dueDate)).toEqual(["2026-11-10", "2026-11-25", "2026-12-10", "2026-12-25"]);
    expect(p.map((x) => x.competence)).toEqual(["2026-11-01", "2026-11-01", "2026-12-01", "2026-12-01"]);
  });

  it("aceita plano ajustado à mão e recusa parcela sem valor ou data", () => {
    const ok = parsePlan(JSON.stringify([{ dueDate: "2026-11-10", amount: "1.000,00" }, { dueDate: "2026-12-10", amount: "2500" }]));
    expect(ok).toEqual([{ dueDate: "2026-11-10", amount: 100000 }, { dueDate: "2026-12-10", amount: 250000 }]);
    expect(parsePlan(JSON.stringify([{ dueDate: "2026-11-10", amount: "0" }, { dueDate: "2026-12-10", amount: "1" }]))).toEqual({ error: "Parcela 1: informe um valor maior que zero." });
    expect(parsePlan(JSON.stringify([{ dueDate: "x", amount: "1" }, { dueDate: "2026-12-10", amount: "1" }]))).toHaveProperty("error");
    expect(parsePlan("[1]")).toHaveProperty("error");
    expect(parsePlan("nada")).toHaveProperty("error");
  });
});
