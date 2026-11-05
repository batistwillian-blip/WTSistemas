import { describe, expect, it } from "vitest";
import { roleAllows } from "@/lib/roles";
import { passwordProblem } from "@/lib/password";
import { changedFields } from "@/lib/diff";

describe("permissões", () => {
  it("respeita a hierarquia", () => {
    expect(roleAllows("leitura", "ver")).toBe(true);
    expect(roleAllows("leitura", "lancar")).toBe(false);
    expect(roleAllows("lancador", "lancar")).toBe(true);
    expect(roleAllows("lancador", "gerir")).toBe(false);
    expect(roleAllows("gestor", "gerir")).toBe(true);
    expect(roleAllows(undefined, "ver")).toBe(false);
  });
});

describe("senha", () => {
  it("exige tamanho e letras com números", () => {
    expect(passwordProblem("curta1")).not.toBeNull();
    expect(passwordProblem("somenteletras")).not.toBeNull();
    expect(passwordProblem("boa-senha-2026")).toBeNull();
  });
});

describe("diff do log", () => {
  it("mostra só os campos alterados", () => {
    expect(changedFields({ a: 1, b: 2, updatedAt: "x" }, { a: 1, b: 3, updatedAt: "y" })).toEqual([{ key: "b", from: 2, to: 3 }]);
  });
});
