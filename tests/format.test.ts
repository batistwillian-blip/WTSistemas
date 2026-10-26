import { describe, expect, it } from "vitest";
import { addDays, addMonths, formatMoney, isValidIsoDate, monthEnd, parseMoney, today } from "@/lib/format";

describe("parseMoney", () => {
  it("aceita formatos brasileiros e simples", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("R$ 10,5")).toBe(1050);
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("1.000")).toBe(100000);
    expect(parseMoney("15")).toBe(1500);
    expect(parseMoney("-3,10")).toBe(-310);
  });
  it("rejeita entradas inválidas", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1,234")).toBeNull();
    expect(parseMoney("1e5")).toBeNull();
  });
});

describe("datas", () => {
  it("soma dias e meses", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
  });
  it("valida datas ISO", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-10-26")).toBe(true);
    expect(isValidIsoDate("26/10/2026")).toBe(false);
  });
  it("usa o fuso de São Paulo para hoje", () => {
    expect(today(new Date("2026-10-27T01:30:00Z"))).toBe("2026-10-26");
  });
  it("formata reais", () => {
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
});
