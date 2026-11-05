import { describe, expect, it } from "vitest";
import { countsInBalance } from "@/lib/chserver-sync";

describe("saldo vindo do CH", () => {
  it("por padrão nada entra no saldo", () => {
    expect(countsInBalance({ paid: false, sales: false, from: null }, "paid", "2026-10-01")).toBe(false);
    expect(countsInBalance({ paid: false, sales: false, from: null }, "sales", "2026-10-01")).toBe(false);
  });
  it("marcado, entra a partir da data do saldo inicial", () => {
    const rules = { paid: true, sales: true, from: "2026-10-26" };
    expect(countsInBalance(rules, "paid", "2026-10-25")).toBe(false);
    expect(countsInBalance(rules, "paid", "2026-10-26")).toBe(true);
    expect(countsInBalance({ ...rules, from: null }, "sales", "2020-01-01")).toBe(true);
  });
});
