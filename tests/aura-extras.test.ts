import { describe, expect, it } from "vitest";
import { parseInstrucao, parseLead, parseNivel } from "@/lib/aura/extras";

describe("parseInstrucao", () => {
  it("aceita orientação nova e limpa espaços", () => {
    expect(parseInstrucao({ acao: "adicionar", texto: "  Ofereça sexta à tarde  " })).toEqual({ acao: "adicionar", texto: "Ofereça sexta à tarde" });
  });
  it("recusa texto curto ou vazio", () => {
    expect(parseInstrucao({ texto: "oi" })).toEqual({ erro: "escreva a orientação" });
    expect(parseInstrucao(null)).toEqual({ erro: "dados inválidos" });
  });
  it("remover exige chave simples", () => {
    expect(parseInstrucao({ acao: "remover", chave: "imhx9k2abcd" })).toEqual({ acao: "remover", chave: "imhx9k2abcd" });
    expect(parseInstrucao({ acao: "remover", chave: "x'; drop" })).toEqual({ erro: "orientação não encontrada" });
  });
});

describe("parseLead", () => {
  it("aceita lead válido e só guarda dígitos do WhatsApp", () => {
    expect(parseLead({ nome: "Maria Silva", numero: "(47) 99999-0000", origem: "indicacao", etapa: "qualificando" })).toEqual({
      nome: "Maria Silva",
      numero: "47999990000",
      cidade: "",
      curso: "",
      origem: "indicacao",
      etapa: "qualificando",
      nivel: "",
      obs: "",
    });
  });
  it("origem ou etapa desconhecida cai no padrão; perdido não é etapa de entrada", () => {
    expect(parseLead({ nome: "Ana Paula", numero: "4799990000", origem: "x", etapa: "perdido" })).toMatchObject({ origem: "outro", etapa: "novo" });
  });
  it("recusa sem nome ou sem DDD", () => {
    expect(parseLead({ nome: "Jo", numero: "47999990000" })).toEqual({ erro: "informe o nome" });
    expect(parseLead({ nome: "João", numero: "99990000" })).toEqual({ erro: "informe o WhatsApp com DDD" });
  });
});

describe("parseNivel", () => {
  it("aceita só os cinco níveis", () => {
    expect(parseNivel({ numero: "+55 47 99999-0000", nivel: "pos" })).toEqual({ numero: "5547999990000", nivel: "pos" });
    expect(parseNivel({ numero: "1", nivel: "doutorado" })).toBeNull();
    expect(parseNivel({ numero: "", nivel: "eja" })).toBeNull();
  });
  it("lead manual guarda o nível escolhido", () => {
    expect(parseLead({ nome: "Ana Paula", numero: "47999990000", nivel: "mestrado" })).toMatchObject({ nivel: "mestrado" });
    expect(parseLead({ nome: "Ana Paula", numero: "47999990000", nivel: "x" })).toMatchObject({ nivel: "" });
  });
});
