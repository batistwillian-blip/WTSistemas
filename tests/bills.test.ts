import { describe, expect, it } from "vitest";
import { applyFilters, billRange, byCategory, csvCell, readBillFilters, summarize, weekGroups, type BillRow } from "@/lib/bills";


const D0 = "2026-10-15";
const row = (o: Partial<BillRow> & { id: number }): BillRow => ({
  amount: 1000,
  dueDate: "2026-10-10",
  paidAt: null,
  competence: null,
  offBalance: false,
  description: "Conta",
  counterpart: null,
  document: null,
  categoryName: null,
  externalCategory: null,
  accountId: 1,
  ...o,
});

describe("filtros de contas", () => {
  it("abre no mês atual, todas as situações, por vencimento", () => {
    expect(readBillFilters({}, D0)).toMatchObject({ month: "2026-10", status: "todas", base: "vencimento" });
    expect(billRange(readBillFilters({}, D0), D0)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("todos os meses só vale para em aberto ou vencidas", () => {
    expect(readBillFilters({ mes: "todas", situacao: "pagas" }, D0).month).toBe("2026-10");
    const f = readBillFilters({ mes: "todas", situacao: "vencidas" }, D0);
    expect(billRange(f, D0)).toEqual({ from: "1900-01-01", to: "2026-10-14" });
  });

  it("filtra por situação, categoria e busca no documento", () => {
    const rows = [
      row({ id: 1, paidAt: "2026-10-09", categoryName: "Luz" }),
      row({ id: 2, dueDate: "2026-10-05", document: "NF 5431" }),
      row({ id: 3, dueDate: "2026-10-20", categoryName: "Luz" }),
    ];
    const f = readBillFilters({}, D0);
    expect(applyFilters(rows, { ...f, status: "pagas" }, D0).map((r) => r.id)).toEqual([1]);
    expect(applyFilters(rows, { ...f, status: "vencidas" }, D0).map((r) => r.id)).toEqual([2]);
    expect(applyFilters(rows, { ...f, status: "aberto" }, D0).map((r) => r.id)).toEqual([2, 3]);
    expect(applyFilters(rows, { ...f, category: "Luz" }, D0).map((r) => r.id)).toEqual([1, 3]);
    expect(applyFilters(rows, { ...f, q: "5431" }, D0).map((r) => r.id)).toEqual([2]);
  });

  it("totais deixam de fora o que é só consulta", () => {
    const t = summarize([row({ id: 1, paidAt: "2026-10-01" }), row({ id: 2 }), row({ id: 3, paidAt: "2026-10-02", offBalance: true, amount: 500 })], D0);
    expect(t).toMatchObject({ total: 2000, paid: 1000, open: 1000, overdue: 1000, consult: 500, consultCount: 1 });
    expect(byCategory([row({ id: 1, amount: 300 }), row({ id: 2, categoryName: "Aluguel", amount: 900 })])[0]).toEqual({ name: "Aluguel", total: 900 });
  });

  it("agrupa por semana de segunda a domingo", () => {
    const g = weekGroups([row({ id: 1, dueDate: "2026-10-04" }), row({ id: 2, dueDate: "2026-10-05" }), row({ id: 3, dueDate: "2026-10-11" })], "vencimento");
    expect(g.map((x) => [x.start, x.rows.map((r) => r.id)])).toEqual([
      ["2026-09-28", [1]],
      ["2026-10-05", [2, 3]],
    ]);
  });
});

describe("exportação", () => {
  it("neutraliza fórmulas e escapa separadores", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a;b"c')).toBe('"a;b""c"');
    expect(csvCell(null)).toBe("");
  });
});
