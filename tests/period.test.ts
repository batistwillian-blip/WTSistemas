import { describe, expect, it } from "vitest";
import { monthsBetween, previousPeriod } from "@/lib/period";

describe("períodos", () => {
  it("mês fechado compara com o mês anterior inteiro", () => {
    expect(previousPeriod({ from: "2026-09-01", to: "2026-09-30", preset: null }, "2026-10-26")).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
  });
  it("mês em andamento compara até o mesmo dia", () => {
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-31", preset: null }, "2026-10-26")).toMatchObject({ from: "2026-09-01", to: "2026-09-26" });
  });
  it("período livre compara com os dias anteriores", () => {
    expect(previousPeriod({ from: "2026-10-10", to: "2026-10-19", preset: null }, "2026-10-26")).toMatchObject({ from: "2026-09-30", to: "2026-10-09" });
  });
  it("lista os meses", () => {
    expect(monthsBetween("2025-11-15", "2026-02-03")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
