import { describe, expect, it } from "vitest";
import { parseMove } from "@/lib/aura/move";

describe("parseMove", () => {
  it("aceita um movimento válido e limpa o número", () => {
    expect(parseMove({ numero: "+55 (47) 9 9999-0000", de: "novo", para: "qualificando" })).toEqual({
      numero: "5547999990000",
      de: "novo",
      para: "qualificando",
      motivo: "",
      curso: "",
    });
  });
  it("recusa etapa desconhecida ou número vazio", () => {
    expect(parseMove({ numero: "123", para: "hackeado" })).toBeNull();
    expect(parseMove({ numero: "abc", para: "novo" })).toBeNull();
    expect(parseMove(null)).toBeNull();
  });
  it("perdido sem motivo vira 'Não informado'; curso só vale para matriculado", () => {
    expect(parseMove({ numero: "1", para: "perdido", curso: "X" })).toMatchObject({ motivo: "Não informado", curso: "" });
    expect(parseMove({ numero: "1", para: "matriculado", curso: " Pedagogia ", motivo: "x" })).toMatchObject({ curso: "Pedagogia", motivo: "" });
  });
  it("etapa de origem inválida fica vazia", () => {
    expect(parseMove({ numero: "1", de: "<script>", para: "novo" })?.de).toBe("");
  });
});
